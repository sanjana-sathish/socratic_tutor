"""
Quiz state machine. Reuses SocraticGenerator's quiz-specific hint/reveal methods
and AnswerChecker from the free-chat tutor.

Hint flow per question:
  - Student answers wrong/confused → give hint (up to MAX_HINTS times)
  - After MAX_HINTS failed attempts → set show_reveal_button=True in response
  - Student clicks "Reveal Answer" button → call reveal_and_advance()
  - Student gets it right at any point → mark correct, advance

Score tracking: correct_count / total_questions shown in final scorecard.
"""

from agents.llm_backend import get_backend
from agents.socratic_generator import SocraticGenerator
from agents.answer_checker import AnswerChecker
from agents.intent_classifier import IntentClassifier

MAX_HINTS = 5  # wrong attempts before "Reveal Answer" button appears


class QuizPipeline:
    def __init__(self, questions: list[dict], persona: str, backend_name: str = "groq"):
        self.questions = questions
        self.persona = persona
        self.index = 0
        self.hints_given = 0           # hints given for the current question
        self.correct_count = 0         # questions answered correctly
        self.questions_attempted = 0   # questions where student submitted at least one answer
        self.done = len(questions) == 0
        self.awaiting_reveal = False   # True once MAX_HINTS exhausted, waiting for reveal click
        self.awaiting_next = False     # True after answer revealed, waiting for "Next" click

        self.generator = SocraticGenerator(get_backend("generator", backend_name))
        self.checker = AnswerChecker(get_backend("classifier", backend_name))
        self.classifier = IntentClassifier(get_backend("classifier", backend_name))

    def current_question(self) -> dict:
        return self.questions[self.index]

    def _context(self) -> list[dict]:
        return [{"text": self.current_question()["context"], "metadata": {"topic": "quiz"}}]

    def _base_payload(self, extra: dict | None = None) -> dict:
        """Common fields on every response."""
        payload = {
            "question_index": self.index,
            "total_questions": len(self.questions),
            "correct_count": self.correct_count,
            "hints_given": self.hints_given,
            "show_reveal_button": self.awaiting_reveal,
            "show_next_button": self.awaiting_next,
        }
        if extra:
            payload.update(extra)
        return payload

    def _advance(self):
        """Move to the next question. Returns nothing — caller handles the next question display."""
        self.index += 1
        self.hints_given = 0
        self.awaiting_reveal = False
        self.awaiting_next = False
        if self.index >= len(self.questions):
            self.done = True

    def _scorecard(self) -> dict:
        total = len(self.questions)
        pct = round((self.correct_count / total) * 100) if total else 0
        if pct == 100:
            grade = "Perfect score! 🎉"
        elif pct >= 80:
            grade = "Great work! 👏"
        elif pct >= 60:
            grade = "Good effort — review the ones you missed."
        else:
            grade = "Keep practicing — you'll get there!"
        return {
            "response": f"Quiz complete!\n\nYou got **{self.correct_count} out of {total}** correct ({pct}%).\n\n{grade}",
            "mode": "complete",
            "scorecard": {
                "correct": self.correct_count,
                "total": total,
                "percent": pct,
                "grade": grade,
            },
            **self._base_payload(),
        }

    def reveal_answer(self) -> dict:
        """Called when student clicks the 'Reveal Answer' button.
        Only shows the answer; the student must click 'Next' to advance."""
        if self.done:
            return {"response": "Quiz already complete.", "mode": "complete", **self._base_payload()}

        context = self._context()
        answer_text = self.generator.generate_quiz_reveal(
            context, self.current_question()["question"], self.persona
        )
        self.awaiting_reveal = False
        self.awaiting_next = True
        return {"response": answer_text, "mode": "answer_revealed", **self._base_payload()}

    def advance_to_next(self) -> dict:
        """Called when student clicks the 'Next' button after answer has been revealed."""
        if not self.awaiting_next:
            return {"response": "No revealed answer to advance from.", "mode": "error", **self._base_payload()}

        self._advance()
        if self.done:
            return self._scorecard()

        next_q = self.current_question()["question"]
        return {
            "response": f"Question {self.index + 1}: {next_q}",
            "mode": "next_question",
            **self._base_payload(),
        }

    def handle_answer(self, student_message: str, conversation_history: str) -> dict:
        if self.done:
            return {"response": "Quiz already complete — start a new one anytime.", "mode": "complete", **self._base_payload()}

        # If awaiting reveal, ignore further text answers and prompt the button
        if self.awaiting_reveal:
            return {
                "response": "Click **Reveal Answer** to see the answer and move on.",
                "mode": "awaiting_reveal",
                **self._base_payload(),
            }

        # If answer already revealed, prompt the Next button
        if self.awaiting_next:
            return {
                "response": "Click **Next** to continue to the next question.",
                "mode": "awaiting_next",
                **self._base_payload(),
            }

        context = self._context()
        intent = self.classifier.classify(student_message, conversation_history)

        if intent == "confused":
            self.hints_given += 1
            if self.hints_given >= MAX_HINTS:
                self.awaiting_reveal = True
                hint = self.generator.generate_quiz_hint(
                    context, conversation_history,
                    self.current_question()["question"],
                    self.hints_given,
                )
                return {
                    "response": hint,
                    "mode": "teach",
                    **self._base_payload(),
                }
            else:
                hint = self.generator.generate_quiz_hint(
                    context, conversation_history,
                    self.current_question()["question"],
                    self.hints_given,
                )
                return {"response": hint, "mode": "teach", **self._base_payload()}

        correctness = self.checker.check(
            student_message, self.current_question()["question"], context
        )

        if correctness["correct"]:
            self.correct_count += 1
            self._advance()
            if self.done:
                sc = self._scorecard()
                sc["response"] = "Correct! 🎉\n\n" + sc["response"]
                return sc
            next_q = self.current_question()["question"]
            return {
                "response": f"Correct! 🎉\n\nQuestion {self.index + 1}: {next_q}",
                "mode": "correct_advance",
                **self._base_payload(),
            }

        # Wrong answer — give a hint
        self.hints_given += 1
        if self.hints_given >= MAX_HINTS:
            self.awaiting_reveal = True
            hint = self.generator.generate_quiz_hint(
                context, conversation_history,
                self.current_question()["question"],
                self.hints_given,
            )
            return {"response": hint, "mode": "teach", **self._base_payload()}

        hint = self.generator.generate_quiz_hint(
            context, conversation_history,
            self.current_question()["question"],
            self.hints_given,
        )
        return {"response": hint, "mode": "teach", **self._base_payload()}