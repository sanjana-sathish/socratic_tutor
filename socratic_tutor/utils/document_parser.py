"""
Parses an uploaded document (PDF or plain text/markdown) into paragraph chunks
for quiz question generation. Separate from rag/retriever.py — that one
serves the static curriculum corpus; this is per-session, ephemeral.
"""

import os
from pypdf import PdfReader


def extract_text(filepath: str) -> str:
    ext = os.path.splitext(filepath)[1].lower()
    if ext == ".pdf":
        reader = PdfReader(filepath)
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    with open(filepath, encoding="utf-8") as f:
        return f.read()


def chunk_text(text: str) -> list[str]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip() and len(p.strip()) > 40]
    return paragraphs