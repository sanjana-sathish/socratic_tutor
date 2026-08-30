# Hallucination-Resistant Multimodal Socratic Tutor — V1

Class 12 Physics scope. Architecture is subject-agnostic by construction —
extending to Chemistry/Math/Bio means adding a corpus + gold-answer schema,
not rewriting the pipeline.

## Setup

```bash
uv venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
uv pip install -r requirements.txt
cp .env.example .env  # fill in GROQ_API_KEY
```

Get a Groq API key: https://console.groq.com

## Ingest curriculum (one-time, before first run)

Add NCERT chapter text to `data/curriculum/<chapter>.txt` (first line: `# topic: <name>`).
A sample `kinematics.txt` is included to test the pipeline end to end.

```bash
python scripts/ingest_curriculum.py
```

## Run

```bash
streamlit run app.py
```

## Architecture

```
Student input (text/image)
  -> input_handler.py       (OCR if image)
  -> intent_classifier.py   (Groq call, constrained output)
  -> retriever.py           (ChromaDB semantic search, subject-scoped)
  -> socratic_generator.py  (Groq call — NO gold answer in scope)
  -> verifier.py            (Groq call — gold answer + context in scope, checks leak + grounding)
  -> pipeline.py            (orchestrates above, regenerates once on verifier fail-flag)
  -> app.py                 (Streamlit chat UI)
```

## Why generator and verifier are separate LLM calls

The generator's job is pedagogy (ask the right next question). The verifier's
job is safety (did it leak the answer, did it hallucinate a fact outside
retrieved context). One prompt trying to be both permissive and restrictive
degrades on both axes — this is the most common failure mode in similar
systems. The gold answer is structurally excluded from the generator's prompt,
so leaking isn't just discouraged by instruction, it's architecturally
difficult.

## LLMBackend abstraction

All LLM calls go through `src/llm_backend.py`'s `LLMBackend` interface.
V1 backend: Groq (open-weight Llama models, closed serving API).
V2: `OllamaBackend` (already stubbed) — same interface, fully local/offline,
zero architecture change required to switch.

## Deferred to V2

- Audio input
- Generated-diagram output
- Multi-subject corpora (Chemistry/Math/Bio)
- Ollama as default local backend
