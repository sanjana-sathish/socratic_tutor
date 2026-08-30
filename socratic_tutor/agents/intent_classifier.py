"""
Classifies incoming student message before it hits the Socratic generator.
"""

from agents.llm_backend import LLMBackend

INTENTS = ["new_problem", "follow_up", "requesting_answer", "confused", "off_topic"]

SYSTEM_PROMPT = f"""You classify a student's message into exactly one intent from this list:
{INTENTS}

- new_problem: student is posing a fresh STEM question/problem to solve
- follow_up: student is giving a substantive attempt at answering the tutor's last question
- requesting_answer: student is explicitly asking for the final answer/solution directly
- confused: student expresses they don't know, aren't sure, or don't understand —
  including short phrases like "I don't know", "no idea", "not sure", "idk", or
  any variant expressing lack of knowledge rather than an actual attempt at an answer
- off_topic: message is unrelated to the problem at hand

Respond with ONLY the intent label, nothing else."""


class IntentClassifier:
    def __init__(self, backend: LLMBackend):
        self.backend = backend

    def classify(self, message: str, conversation_context: str = "") -> str:
        user_prompt = f"Conversation so far:\n{conversation_context}\n\nLatest message:\n{message}"
        raw = self.backend.generate(SYSTEM_PROMPT, user_prompt, temperature=0.0).strip().lower()
        for intent in INTENTS:
            if intent in raw:
                return intent
        return "off_topic"