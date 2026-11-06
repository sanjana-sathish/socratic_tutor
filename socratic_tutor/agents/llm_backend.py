"""
LLMBackend: single abstraction every LLM call in the system goes through.
V1 concrete implementation: GroqBackend (open-weight models, closed API).
V2: OllamaBackend implements the same interface for fully local/offline operation.
Nothing outside this file should import `groq` directly.

Model choice is per-component, not global — the classifier/verifier are
constrained-output tasks (pick 1 of 5 labels, emit 1 JSON object) and don't
need the same reasoning capacity as the Socratic generator.
"""

from abc import ABC, abstractmethod
import os
from groq import Groq


class LLMBackend(ABC):
    @abstractmethod
    def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.3) -> str:
        raise NotImplementedError


class GroqBackend(LLMBackend):
    def __init__(self, model: str, api_key: str | None = None):
        self.client = Groq(api_key=api_key or os.environ["GROQ_API_KEY"])
        self.model = model
        self.last_usage = None

    def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.3) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            temperature=temperature,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        if hasattr(response, "usage") and response.usage:
            self.last_usage = response.usage
        return response.choices[0].message.content


class OllamaBackend(LLMBackend):
    def __init__(self, model: str = "llama3.1:8b", host: str = "http://localhost:11434"):
        self.model = model
        self.host = host

    def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.3) -> str:
        import requests
        resp = requests.post(
            f"{self.host}/api/chat",
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "options": {"temperature": temperature},
                "stream": False,
            },
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"]


def get_backend(role: str, backend_name: str = "groq") -> LLMBackend:
    if backend_name == "groq":
        env_var = {
            "generator": "GROQ_GENERATOR_MODEL",
            "classifier": "GROQ_CLASSIFIER_MODEL",
            "verifier": "GROQ_VERIFIER_MODEL",
        }[role]
        model = os.environ.get(env_var)
        if not model:
            raise ValueError(f"Missing {env_var} in environment/.env")
        return GroqBackend(model=model)
    if backend_name == "ollama":
        return OllamaBackend()
    raise ValueError(f"Unknown backend: {backend_name}")