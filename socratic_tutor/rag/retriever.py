"""
Retrieval layer over verified curriculum chunks. Schema is subject-agnostic:
every chunk carries {subject, chapter, topic} metadata.
"""

import os
import chromadb
from chromadb.config import Settings
from rag.embeddings import Embedder


class CurriculumRetriever:
    def __init__(self, persist_dir: str | None = None, collection_name: str = "curriculum"):
        persist_dir = persist_dir or os.environ.get("CHROMA_PERSIST_DIR", "./data/chroma_db")
        self.client = chromadb.PersistentClient(path=persist_dir, settings=Settings(anonymized_telemetry=False))
        self.collection = self.client.get_or_create_collection(collection_name)
        self.embedder = Embedder()

    def add_chunks(self, chunks: list[dict]):
        self.collection.add(
            ids=[c["id"] for c in chunks],
            documents=[c["text"] for c in chunks],
            embeddings=self.embedder.encode([c["text"] for c in chunks]),
            metadatas=[
                {"subject": c["subject"], "chapter": c["chapter"], "topic": c["topic"]}
                for c in chunks
            ],
        )

    def query(self, text: str, subject: str | None = None, k: int = 5) -> list[dict]:
        where = {"subject": subject} if subject else None
        result = self.collection.query(
            query_embeddings=[self.embedder.encode_one(text)],
            n_results=k,
            where=where,
        )
        return [
            {"text": doc, "metadata": meta}
            for doc, meta in zip(result["documents"][0], result["metadatas"][0])
        ]