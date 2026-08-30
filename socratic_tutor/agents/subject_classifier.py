"""
Classifies which STEM subject a question belongs to, before any other routing.
Only re-run when no active topic is in progress (see pipeline.py).
Takes conversation context so a short follow-up right after a topic closes
("what about the matrix?") can still be classified correctly.
"""

from agents.llm_backend import LLMBackend

SUBJECTS = ["physics", "chemistry", "biology", "math", "off_topic"]

SYSTEM_PROMPT = f"""You classify a student's question into exactly one subject from this list:
{SUBJECTS}

- off_topic: not a STEM question at all
Use the conversation history for context if the latest message alone is short or ambiguous
(e.g. a follow-up like "what about the matrix?" right after a biology discussion is biology,
not off_topic).
Respond with ONLY the subject label, nothing else."""


class SubjectClassifier:
    def __init__(self, backend: LLMBackend):
        self.backend = backend

    def classify(self, message: str, conversation_context: str = "") -> str:
        user_prompt = f"Conversation so far:\n{conversation_context}\n\nLatest message:\n{message}"
        raw = self.backend.generate(SYSTEM_PROMPT, user_prompt, temperature=0.0).strip().lower()
        for subject in SUBJECTS:
            if subject in raw:
                return subject
        return "off_topic"