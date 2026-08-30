"""
Modes:
  probe  — ask a question. First turn of a topic is diagnostic.
  teach  — explain ONE small chunk, then check understanding.
  reveal — short closing wrap-up. Still conversational, not a block dump.
"""

from agents.llm_backend import LLMBackend

TONE_RULE = """Write like you're speaking in a chat, not writing a document.
2-4 short sentences maximum per response. NO headers, NO bullet lists, NO markdown
bold/asterisks, NO dumping multiple formulas or facts at once. One idea at a time.
Use LaTeX with $ for inline math and $$ for block math - never \\[ \\], \\( \\), or \\boxed{}."""

PROBE_BASE_FIRST_TURN = f"""This is the FIRST question on a new topic. Ask a diagnostic question
to gauge how much the student already knows - e.g. "What do you already know about X?" -
NOT a narrow technical sub-question that assumes prior knowledge.
Ground it in the provided curriculum context.
{TONE_RULE}"""

PROBE_BASE_FOLLOWUP = f"""Ask exactly ONE guiding question to help the student think toward the next part of the answer.
Do NOT state the final definition or answer yet.
Ground the question in the provided curriculum context.
{TONE_RULE}"""

TEACH_BASE = f"""The student does not know this yet (either said so directly, or got the last
check wrong). Explain ONE small, clear chunk of the concept - just the next logical piece,
building on anything already covered in the conversation history. Do not repeat what's
already been explained. Then ask ONE simple check-understanding question about just that chunk.
{TONE_RULE}"""

REVEAL_BASE = f"""Give a short closing wrap-up now that the topic has been covered chunk by chunk.
Briefly tie together what was covered - do not reintroduce it as a formal definition block.
If the student's last answer was incorrect, correct that specific point first, in one sentence.
End with a short, natural closing line that signals the topic is done and invites a new question -
e.g. "That covers it — anything else, or a new question?" Vary the phrasing, don't ask a follow-up
question about the same topic.
{TONE_RULE}"""


class SocraticGenerator:
    def __init__(self, backend: LLMBackend):
        self.backend = backend

    def generate_probe(self, student_message: str, retrieved_context: list[dict], conversation_history: str, persona: str, is_first_turn: bool = False) -> str:
        base = PROBE_BASE_FIRST_TURN if is_first_turn else PROBE_BASE_FOLLOWUP
        system_prompt = f"{persona}\n\n{base}"
        context_block = "\n---\n".join(c["text"] for c in retrieved_context)
        user_prompt = f"""Curriculum context:
{context_block}

Conversation history:
{conversation_history}

Student's latest message:
{student_message}

Ask your next question."""
        return self.backend.generate(system_prompt, user_prompt, temperature=0.4)

    def generate_teach(self, retrieved_context: list[dict], conversation_history: str, persona: str) -> str:
        system_prompt = f"{persona}\n\n{TEACH_BASE}"
        context_block = "\n---\n".join(c["text"] for c in retrieved_context)
        user_prompt = f"""Curriculum context:
{context_block}

Conversation history (note what's already been covered - don't repeat it):
{conversation_history}

Teach the next small chunk."""
        return self.backend.generate(system_prompt, user_prompt, temperature=0.4)

    def generate_reveal(self, retrieved_context: list[dict], conversation_history: str, correct: bool, misconception: str, persona: str) -> str:
        system_prompt = f"{persona}\n\n{REVEAL_BASE}"
        context_block = "\n---\n".join(c["text"] for c in retrieved_context)
        user_prompt = f"""Curriculum context:
{context_block}

Conversation history:
{conversation_history}

Student's last answer was {"CORRECT" if correct else "INCORRECT"}.
{"Point to correct: " + misconception if not correct else ""}

Give the short closing wrap-up now."""
        return self.backend.generate(system_prompt, user_prompt, temperature=0.3)