"""
Quiz state machine. Reuses SocraticGenerator's teach/reveal and AnswerChecker
from the free-chat tutor — same remediation logic, driven by a fixed question
list instead of open-ended topic routing.
"""

from agents.llm_backend import get_backend
from agents.socratic_generator import SocraticGenerator
from agents.answer_checker import AnswerChecker
from agents.intent_classifier import IntentClassifier

MAX_TEACH_CHUNKS = 2  # per quiz question, before revealing and moving on


class QuizPipeline:
    def __init__(self, questions: list[dict], persona: str, backend_name: str = "groq"):
        self.questions = questions
        self.persona = persona
        self.index = 0
        self.teach_chunks_given = 0
        self.done = len(questions) == 0

        self.generator = SocraticGenerator(get_backend("generator", backend_name))
        self.checker = AnswerChecker(get_backend("classifier", backend_name))
        self.classifier = IntentClassifier(get_backend("classifier", backend_name))

    def current_question(self) -> dict:
        return self.questions[self.index]

    def _context(self) -> list[dict]:
        return [{"text": self.current_question()["context"], "metadata": {"topic": "quiz"}}]

    def _advance_line(self) -> str:
        self.index += 1
        self.teach_chunks_given = 0
        if self.index >= len(self.questions):
            self.done = True
            return "\n\nThat's the last question — quiz complete! Nice work."
        return f"\n\nNext question: {self.current_question()['question']}"

    def handle_answer(self, student_message: str, conversation_history: str) -> dict:
        if self.done:
            return {"response": "Quiz already complete — start a new one anytime.", "mode": "complete"}

        context = self._context()
        intent = self.classifier.classify(student_message, conversation_history)

        if intent == "confused":
            self.teach_chunks_given += 1
            if self.teach_chunks_given > MAX_TEACH_CHUNKS:
                response = self.generator.generate_reveal(
                    context, conversation_history, correct=False, misconception="", persona=self.persona
                )
                response += self._advance_line()
                mode = "reveal_move_on"
            else:
                response = self.generator.generate_teach(context, conversation_history, self.persona)
                mode = "teach"
            return {"response": response, "mode": mode, "question_index": self.index}

        correctness = self.checker.check(student_message, self.current_question()["question"], context)

        if correctness["correct"]:
            response = "Correct!" + self._advance_line()
            return {"response": response, "mode": "correct_advance", "question_index": self.index}

        self.teach_chunks_given += 1
        if self.teach_chunks_given > MAX_TEACH_CHUNKS:
            response = self.generator.generate_reveal(
                context, conversation_history, correct=False,
                misconception=correctness["misconception"], persona=self.persona,
            )
            response += self._advance_line()
            mode = "reveal_move_on"
        else:
            response = self.generator.generate_teach(context, conversation_history, self.persona)
            mode = "teach"

        return {"response": response, "mode": mode, "question_index": self.index}