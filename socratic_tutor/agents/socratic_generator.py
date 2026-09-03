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

REVEAL_BASE = f"""Give a short closing wrap-up. You MUST directly answer the student's original
question as stated in the conversation history — this is the most important requirement.
If the student's last answer was incorrect, correct that specific point first in one sentence.
Do not drift to adjacent topics. End with one natural sentence inviting a new question.
{TONE_RULE}"""

QUIZ_HINT_BASE = """You are giving a HINT to help a student answer a quiz question. 
STRICT RULES — violating any rule is a failure:
1. DO NOT state, imply, or contain the answer in any form. No synonyms, no near-answers.
2. Maximum 1-2 lines. Be concise.
3. Each hint should reveal ONE new angle (definition of a key term, a related principle, 
   a real-world analogy) that nudges the student closer WITHOUT giving the answer away.
4. Build on earlier hints from the conversation — do NOT repeat what was already said.
5. No bullet lists, no headers, no markdown bold."""

QUIZ_REVEAL_BASE = """The student has exhausted their attempts. Now give the clear, direct answer.
RULES:
1. Start by stating the correct answer plainly in the first sentence.
2. Give a 1-2 sentence explanation of WHY that answer is correct.
3. Keep it conversational, no bullet lists or headers.
4. Use LaTeX with $ for inline math and $$ for block math."""


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

    def generate_teach(self, retrieved_context: list[dict], conversation_history: str, persona: str, current_question: str = "") -> str:
        system_prompt = f"{persona}\n\n{TEACH_BASE}"
        context_block = "\n---\n".join(c["text"] for c in retrieved_context)
        question_line = (
            f"\nThe student is specifically trying to answer this question: {current_question}\n"
            "Give a hint that directly helps them think toward the answer to THAT question — not general background."
        ) if current_question else ""
        user_prompt = f"""Curriculum context:
{context_block}
{question_line}
Conversation history (note what's already been covered - don't repeat it):
{conversation_history}

Teach the next small chunk."""
        return self.backend.generate(system_prompt, user_prompt, temperature=0.4)

    def generate_reveal(self, retrieved_context: list[dict], conversation_history: str, correct: bool, misconception: str, persona: str, original_question: str = "") -> str:
        system_prompt = f"{persona}\n\n{REVEAL_BASE}"
        context_block = "\n---\n".join(c["text"] for c in retrieved_context)
        orig_line = (
            f"The student's original question was: {original_question}\n"
            "Your wrap-up MUST directly and completely answer that question.\n\n"
        ) if original_question else ""
        user_prompt = f"""Curriculum context:
{context_block}

{orig_line}Conversation history:
{conversation_history}

Student's last answer was {"CORRECT" if correct else "INCORRECT"}.
{"Point to correct: " + misconception if not correct else ""}

Give the short closing wrap-up now."""
        return self.backend.generate(system_prompt, user_prompt, temperature=0.3)

    def generate_quiz_hint(self, retrieved_context: list[dict], conversation_history: str, current_question: str, hint_number: int) -> str:
        """Strictly no-answer hint for quiz mode, max 1-2 lines, progressive detail."""
        system_prompt = QUIZ_HINT_BASE
        context_block = "\n---\n".join(c["text"] for c in retrieved_context)
        user_prompt = f"""Quiz question the student is trying to answer:
{current_question}

Curriculum context (use this to form your hint, never copy the answer from it):
{context_block}

Conversation so far (earlier hints are here — do NOT repeat them):
{conversation_history}

This is hint #{hint_number}. Each hint should go one step deeper than the last.
Give hint #{hint_number} now — maximum 2 lines, NO answer."""
        return self.backend.generate(system_prompt, user_prompt, temperature=0.5)

    def generate_quiz_reveal(self, retrieved_context: list[dict], current_question: str, persona: str) -> str:
        """Reveal the direct answer after student has exhausted attempts."""
        system_prompt = f"{persona}\n\n{QUIZ_REVEAL_BASE}"
        context_block = "\n---\n".join(c["text"] for c in retrieved_context)
        user_prompt = f"""Quiz question:
{current_question}

Curriculum context (use this as ground truth for the answer):
{context_block}

State the correct answer clearly now."""
        return self.backend.generate(system_prompt, user_prompt, temperature=0.2)