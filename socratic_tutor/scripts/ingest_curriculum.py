"""
Ingest curriculum markdown/text into ChromaDB. Reads all subject files
directly under knowledge/ — file naming convention: <subject>.md
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from rag.retriever import CurriculumRetriever

CURRICULUM_DIR = os.path.join(os.path.dirname(__file__), "..", "knowledge")


def chunk_file(filepath: str, subject: str, chapter: str) -> list[dict]:
    with open(filepath) as f:
        content = f.read()

    topic = "general"
    lines = content.splitlines()
    if lines and lines[0].startswith("# topic:"):
        topic = lines[0].replace("# topic:", "").strip()
        content = "\n".join(lines[1:])

    paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
    return [
        {"id": f"{subject}_{chapter}_{i}", "text": para, "subject": subject, "chapter": chapter, "topic": topic}
        for i, para in enumerate(paragraphs)
    ]


def main():
    retriever = CurriculumRetriever()
    all_chunks = []
    for fname in os.listdir(CURRICULUM_DIR):
        if fname.endswith((".md", ".txt")):
            subject = fname.split(".")[0].split("_")[0]
            chapter = fname.rsplit(".", 1)[0]
            all_chunks.extend(chunk_file(os.path.join(CURRICULUM_DIR, fname), subject, chapter))

    if not all_chunks:
        print(f"No .md/.txt files found in {CURRICULUM_DIR}.")
        return

    retriever.add_chunks(all_chunks)
    print(f"Ingested {len(all_chunks)} chunks from {CURRICULUM_DIR}")


if __name__ == "__main__":
    main()