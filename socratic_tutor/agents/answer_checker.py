"""
Correctness check on the student's last response, judged from retrieved
curriculum context only (no gold-answer store).

KNOWN LIMITATION: for numeric/derivation problems with arbitrary student-typed
values, judging correctness from context alone is weaker than checking against
a computed value. A future "solver" step would close that gap. Concept
questions are unaffected — curriculum context is sufficient ground truth there.
"""

import json
from agents.llm_backend import LLMBackend

SYSTEM_PROMPT = """You check whether a student's answer is correct, given curriculum context.
Return ONLY valid JSON:
{"correct": true/false, "misconception": "short description of what's wrong, or empty string if correct"}
"""


class AnswerChecker:
    def __init__(self, backend: LLMBackend):
        self.backend = backend

    def check(self, student_answer: str, tutor_last_question: str, retrieved_context: list[dict]) -> dict:
        context_block = "\n---\n".join(c["text"] for c in retrieved_context)
        user_prompt = f"""Tutor's last question: {tutor_last_question}
Student's answer: {student_answer}

Curriculum context:
{context_block}

Return the JSON verdict."""
        raw = self.backend.generate(SYSTEM_PROMPT, user_prompt, temperature=0.0)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"correct": False, "misconception": "unable to verify"}