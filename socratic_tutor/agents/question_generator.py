"""
Generates N quiz questions from document chunks. Each question is tagged
with the exact chunk it was drawn from, so quiz_pipeline.py can ground
teaching/correction for that question without re-querying anything.

If there are meaningfully more chunks than questions needed, uses embedding
distance to pick a diverse spread of chunks first — this is the one place
in Quiz Me where retrieval-style selection actually does real work, since
for a short doc there'd be nothing to select between.
"""

import json
from agents.llm_backend import LLMBackend
from rag.embeddings import Embedder
import numpy as np


def select_diverse_chunks(chunks: list[str], n_needed: int) -> list[str]:
    if len(chunks) <= n_needed * 2:
        return chunks  # not enough chunks to bother selecting - use all

    embedder = Embedder()
    vectors = np.array(embedder.encode(chunks))

    # Greedy max-diversity sampling: start from chunk 0, repeatedly add the
    # chunk farthest (on average) from what's already selected.
    selected_idx = [0]
    while len(selected_idx) < n_needed:
        remaining = [i for i in range(len(chunks)) if i not in selected_idx]
        dists = [
            min(np.linalg.norm(vectors[i] - vectors[j]) for j in selected_idx)
            for i in remaining
        ]
        selected_idx.append(remaining[int(np.argmax(dists))])

    return [chunks[i] for i in selected_idx]


SYSTEM_PROMPT = """You write quiz questions from provided text chunks. For each chunk given,
write exactly ONE clear question testing understanding of that chunk's content.
Return ONLY valid JSON: a list of objects, each {"question": "...", "chunk_index": <int>}
where chunk_index refers to the chunk (0-indexed) the question was drawn from."""


class QuestionGenerator:
    def __init__(self, backend: LLMBackend):
        self.backend = backend

    def generate(self, chunks: list[str], n_questions: int) -> list[dict]:
        selected = select_diverse_chunks(chunks, n_questions)
        # cycle through selected chunks if more questions requested than chunks available
        working_chunks = (selected * ((n_questions // len(selected)) + 1))[:n_questions]

        numbered = "\n\n".join(f"[{i}] {c}" for i, c in enumerate(working_chunks))
        user_prompt = f"""Chunks:
{numbered}

Generate exactly {n_questions} questions, one per chunk in order."""
        raw = self.backend.generate(SYSTEM_PROMPT, user_prompt, temperature=0.5)
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = [{"question": f"Explain: {c[:80]}...", "chunk_index": i} for i, c in enumerate(working_chunks)]

        return [
            {"question": item["question"], "context": working_chunks[item.get("chunk_index", i) % len(working_chunks)]}
            for i, item in enumerate(parsed[:n_questions])
        ]