"""
Verifier LLM: separate call, separate responsibility from the generator.
No gold-answer comparison — checks are structural: in probe mode, the draft
must NOT state any definitive final answer/formula at all.
"""

import json
from agents.llm_backend import LLMBackend

SYSTEM_PROMPT = """You are a strict verifier for a Socratic tutoring system, checking a
DRAFT TUTOR RESPONSE that is meant to be a probing question, not a final answer.

You will be given the retrieved curriculum context (source of truth for facts) and the draft.

Return ONLY valid JSON with this shape:
{"leak_detected": true/false, "leak_reason": "...", "ungrounded_claim_detected": true/false, "ungrounded_reason": "..."}

leak_detected = true if the draft states or heavily implies a final numeric value, formula,
or definitive answer to the question at hand — this should NEVER happen in a probing turn,
regardless of whether the stated value is correct.
ungrounded_claim_detected = true if the draft asserts a fact not supported by the given context.
"""


class Verifier:
    def __init__(self, backend: LLMBackend):
        self.backend = backend

    def verify(self, draft_response: str, retrieved_context: list[dict]) -> dict:
        context_block = "\n---\n".join(c["text"] for c in retrieved_context)
        user_prompt = f"""Retrieved context:
{context_block}

Draft tutor response:
{draft_response}

Return the JSON verdict."""
        raw = self.backend.generate(SYSTEM_PROMPT, user_prompt, temperature=0.0)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"leak_detected": True, "leak_reason": "verifier_parse_failure",
                    "ungrounded_claim_detected": True, "ungrounded_reason": "verifier_parse_failure"}