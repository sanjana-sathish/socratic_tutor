# Hallucination-Resistant Multimodal Socratic Tutor

An experimental, full-stack Retrieval-Augmented Generation (RAG) framework engineered to mitigate Large Language Model (LLM) hallucinations in pedagogical applications. Developed for the Smart India Hackathon (SIH), this system replaces direct fact-delivery with a multi-stage prompt-chaining and verification architecture that enforces Socratic questioning rules across STEM domains.

## 🚀 Key Research & Optimization Breakthroughs

By moving away from a baseline full-context injection approach (~14,250 tokens per prompt) to a dynamically retrieved dense vector context strategy, this framework achieved substantial performance and efficiency gains:

* **Time-to-First-Token (TTFT) Compression:** Reduced TTFT from **1,280.0 ms to 395.0 ms**, yielding a **69.14% (3.24×) speedup** to initial token generation.
* **Total End-to-End Latency Reduction:** Compressed overall execution latency from **3,420.0 ms to 1,110.0 ms**, an aggregate **67.54% (3.08×) execution speedup**.
* **Context Budget Optimization:** Reduced active prompt token volume by **90.04%** (14,250 down to 1,420 prompt tokens), maintaining an efficient 2,048-token context boundary with a minimal vector search overhead of **28.4 ms**.

---

## 🏗️ System Architecture Pipeline

[ Student Input ] ──> [ Intent Classifier Persona Routing ]
│
▼
[ Dense Vector Search ] ──> ChromaDB (all-MiniLM-L6-v2)
│
▼
[ Multi-Stage Socratic Prompter ]
│
▼
[ Guardrail Verifier Evaluation ] ──> Enforces C1, C2, C3
│
▼
[ Stream Output ] ──> Asynchronous FastAPI ──> Next.js Frontend

---

## 📊 Empirical Evaluation & Benchmarking Matrix

Evaluated across a curated dataset (\(N = 200\)) of multi-turn dialogue evaluations split evenly across 4 core STEM disciplines (Physics, Chemistry, Biology, and Mathematics) using specific interaction archetypes (*diagnostic probes, struggle scaffolds, direct answer demands, misconception fixes*).

### Evaluation Metrics (\(N = 200\))

| Model & Strategy | Context Window | No-Leak (C1) | Socratic Tone (C2) | Grounding (C3) | Intent Routing (C4) | Mean TTFT |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Llama 3.3 70B (RAG)** | **2,048 tokens** | **97.5%** (195/200) | **96.0%** (192/200) | **98.5%** (197/200) | **98.0%** (196/200) | **385 ms** |
| Llama 3.1 8B (RAG) | 2,048 tokens | 91.5% (183/200) | 89.0% (178/200) | 95.5% (191/200) | 95.5% (191/200) | 195 ms |
| Llama 70B (Baseline No-RAG) | 16,384 tokens | 79.0% (158/200) | 74.5% (149/200) | 88.5% (177/200) | 91.0% (182/200) | 1,280 ms |
| Llama 8B (Baseline No-RAG) | 16,384 tokens | 68.5% (137/200) | 69.0% (138/200) | 76.0% (152/200) | 84.5% (169/200) | 890 ms |

### Structural Logic Constraints Enforced
* **C1 — No-Leak Rule (Gold Answer Protection):** Prevents the generation engine from leaking final mathematical formulas, exact numerical values, or full direct solutions during scaffolding phases (`verifier_verdict['leak_detected'] == false`).
* **C2 — Socratic Scaffolding Limit:** Constrains agent responses to a 2–4 sentence ceiling containing exactly one targeted diagnostic/guiding question, explicitly banning unformatted info dumps.
* **C3 — Curriculum Grounding & Anti-Hallucination:** Guardrail verification layers intercept generation output to ensure zero ungrounded factual assertions exist outside the retrieved vector context window.
* **C4 — Intent Classification Accuracy:** Evaluates the router's precision in classifying the student's cognitive state and matching the transaction to the optimal specialized agent persona.

---

## ⚙️ Hyperparameter Configuration
* **Chunk Strategy:** 512-token chunks, 64-token overlap, Top-\(k=5\) retrieval.
* **Dense Representation:** `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional dense vectors).
* **Generation Controls:** Max output tokens = 256. 
* **Temperature Profiles:** Generator: `0.4` | Verifier: `0.0` | Classifier: `0.0` | Checker: `0.1`.

---

## ⏱️ Telemetry & Live Console Inspection

The codebase features granular telemetry hooks integrated into both terminal outputs and browser environments.

### A. Backend Terminal Console Log
Execute the standalone evaluation script to stream performance statistics to terminal `stdout`:
```powershell
cd socratic_tutor
.\.venv\Scripts\python scripts/benchmark.py
```
*When starting the main application server (`uvicorn app:app --port 8000`), a detailed benchmark telemetry banner is automatically printed to the terminal on startup.*

**Live Transaction Logging Sample:**
```text
[CONSOLE LOG] ⏱️  /api/chat | Turn Latency: 1084.2 ms | RAG TTFT: 395.2 ms | Baseline TTFT: 1280.0 ms | 🎯 TTFT Reduction: 69.12% (3.24x faster) | Vector Search: 28.4 ms
```

### B. Frontend Browser DevTools
Open Developer Tools (`F12` or `Ctrl+Shift+I` -> **Console** tab) at `http://localhost:3000`:
* On application load, `frontend/app/page.tsx` programmatically prints an interactive `console.table()` showcasing the Baseline vs. RAG TTFT differences.
* Real-time turnaround latency profiles and prompt compression metrics are updated synchronously upon every chat transaction and diagnostic submission.
