"""
Diagnostic -> teach (chunk by chunk) -> short wrap-up, with subject routing.
"""

import time
from agents.llm_backend import get_backend
from rag.retriever import CurriculumRetriever
from agents.subject_classifier import SubjectClassifier
from experts import REGISTRY
from agents.intent_classifier import IntentClassifier
from agents.socratic_generator import SocraticGenerator
from agents.answer_checker import AnswerChecker
from agents.verifier import Verifier

MAX_TEACH_CHUNKS = 3   # how many small chunks before wrapping up
MAX_PROBE_TURNS = 3    # safety cap for the plain probe/answer-check path


class TutorPipeline:
    def __init__(self, backend_name: str = "groq"):
        self.retriever = CurriculumRetriever()
        self.subject_classifier = SubjectClassifier(get_backend("classifier", backend_name))
        self.classifier = IntentClassifier(get_backend("classifier", backend_name))
        self.generator = SocraticGenerator(get_backend("generator", backend_name))
        self.checker = AnswerChecker(get_backend("classifier", backend_name))
        self.verifier = Verifier(get_backend("verifier", backend_name))

        self.turn_count = 0
        self.teach_chunks_given = 0
        self.in_teach_sequence = False
        self.last_tutor_question = ""
        self.active_subject = None
        self.original_student_question = ""

    def _reset_topic(self):
        self.turn_count = 0
        self.teach_chunks_given = 0
        self.in_teach_sequence = False
        self.last_tutor_question = ""
        self.original_student_question = ""

    def handle_turn(self, student_message: str, conversation_history: str) -> dict:
        
        if not self.last_tutor_question:
            subject = self.subject_classifier.classify(student_message, conversation_history)
        else:
            subject = self.active_subject

        if subject == "off_topic":
            return {
                "response": "That's outside Physics, Chemistry, Biology, or Math — what would you like help with in one of those?",
                "intent": "off_topic", "mode": "reject", "subject": "off_topic", "correctness": None,
                "verifier_verdict": {"leak_detected": False, "ungrounded_claim_detected": False},
                "retrieved_topics": [],
            }

        config = REGISTRY[subject]
        self.active_subject = subject

        is_new_topic = not self.last_tutor_question
        intent = self.classifier.classify(student_message, conversation_history)
        t_ret_start = time.perf_counter()
        retrieved = self.retriever.query(student_message, subject=config["curriculum_subject_tag"], k=5)
        retrieval_ms = (time.perf_counter() - t_ret_start) * 1000

        if is_new_topic:
            intent = "new_problem"

        if intent == "new_problem":
            self._reset_topic()
            self.original_student_question = student_message  # anchor the topic
            response = self.generator.generate_probe(
                student_message, retrieved, conversation_history, config["persona"], is_first_turn=True
            )
            self.last_tutor_question = response
            mode = "probe"
            correctness = None

        elif intent == "requesting_answer":
            # Student is asking for the answer directly — nudge them to try instead
            response = (
                "I'm here to help you figure it out, not hand it over! "
                "Give it a shot — what do you think the answer might be? "
                "Even a guess is a great starting point."
            )
            mode = "redirect"
            correctness = None

        elif intent == "confused":
            self.in_teach_sequence = True
            self.teach_chunks_given += 1
            if self.teach_chunks_given > MAX_TEACH_CHUNKS:
                response = self.generator.generate_reveal(
                    retrieved, conversation_history, correct=False,
                    misconception="", persona=config["persona"],
                    original_question=self.original_student_question,
                )
                mode = "reveal"
                self._reset_topic()
            else:
                response = self.generator.generate_teach(retrieved, conversation_history, config["persona"])
                self.last_tutor_question = response
                mode = "teach"
            correctness = None

        elif intent == "off_topic":
            response = f"That's off-topic for this. Back to it: {self.last_tutor_question}"
            mode = "redirect"
            correctness = None

        else:  # follow_up — an actual attempt at the answer
            correctness = self.checker.check(student_message, self.last_tutor_question, retrieved)

            if self.in_teach_sequence:
                # Correct check-answer during a teach sequence -> next chunk,
                # NOT a jump to full reveal. Wrong -> generator corrects and
                # re-teaches the same chunk differently.
                self.teach_chunks_given += 1
                if correctness["correct"] and self.teach_chunks_given > MAX_TEACH_CHUNKS:
                    response = self.generator.generate_reveal(
                        retrieved, conversation_history, correct=True, misconception="", persona=config["persona"],
                        original_question=self.original_student_question,
                    )
                    mode = "reveal"
                    self._reset_topic()
                else:
                    response = self.generator.generate_teach(retrieved, conversation_history, config["persona"])
                    self.last_tutor_question = response
                    mode = "teach"
            else:
                self.turn_count += 1
                if correctness["correct"] or self.turn_count >= MAX_PROBE_TURNS:
                    response = self.generator.generate_reveal(
                        retrieved, conversation_history,
                        correct=correctness["correct"], misconception=correctness["misconception"],
                        persona=config["persona"],
                        original_question=self.original_student_question,
                    )
                    mode = "reveal"
                    self._reset_topic()
                else:
                    response = self.generator.generate_probe(
                        student_message, retrieved, conversation_history, config["persona"], is_first_turn=False
                    )
                    self.last_tutor_question = response
                    mode = "probe"

        verdict = self.verifier.verify(response, retrieved) if mode in ("probe", "teach") else {"leak_detected": False, "ungrounded_claim_detected": False}

        return {
            "response": response, "intent": intent, "mode": mode, "subject": subject,
            "correctness": correctness, "verifier_verdict": verdict,
            "retrieved_topics": [r["metadata"]["topic"] for r in retrieved],
            "retrieval_ms": round(retrieval_ms, 2),
        }