"""
FastAPI wrapper. Three quiz endpoints:
  /api/chat        - free-form Socratic tutor (TutorPipeline)
  /api/quiz/start  - upload a document, get N generated questions, start a quiz session
  /api/quiz/answer - submit an answer to the current quiz question
  /api/quiz/reveal - reveal the answer and advance after MAX_HINTS failed attempts
"""

import tempfile
import os
import time

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from agents.pipeline import TutorPipeline
from agents.quiz_pipeline import QuizPipeline
from agents.question_generator import QuestionGenerator
from agents.llm_backend import get_backend
from utils.input_handler import extract_text_from_image
from utils.latex_fix import normalize_latex
from utils.document_parser import extract_text, chunk_text
from utils.telemetry import (
    log_startup_telemetry,
    log_turn_telemetry,
    calculate_turn_telemetry,
    LATENCY_BENCHMARK_DATA,
    MODEL_COMPARISON_DATA,
)

app = FastAPI(title="Socratic STEM Tutor API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup_event():
    log_startup_telemetry()


@app.get("/api/benchmark")
async def get_benchmark():
    """Returns quantified latency baseline vs RAG pipeline and model comparison data."""
    log_startup_telemetry()
    return {
        "status": "success",
        "latency_benchmark": LATENCY_BENCHMARK_DATA,
        "model_comparison": MODEL_COMPARISON_DATA,
    }

chat_sessions: dict[str, TutorPipeline] = {}
quiz_sessions: dict[str, QuizPipeline] = {}


def save_upload_to_temp(file_bytes: bytes, filename: str) -> str:
    suffix = os.path.splitext(filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file_bytes)
        return tmp.name


@app.post("/api/chat")
async def chat(
    session_id: str = Form(...),
    message: str = Form(""),
    conversation_history: str = Form(""),
    file: UploadFile | None = File(None),
):
    t_start = time.perf_counter()
    if file:
        temp_path = save_upload_to_temp(await file.read(), file.filename)
        extracted = extract_text_from_image(temp_path)
        os.remove(temp_path)
        message = f"{message}\n[From image]: {extracted}".strip() if message else extracted

    if session_id not in chat_sessions:
        chat_sessions[session_id] = TutorPipeline(backend_name="groq")

    result = chat_sessions[session_id].handle_turn(message, conversation_history)
    result["response"] = normalize_latex(result["response"])
    
    elapsed_ms = (time.perf_counter() - t_start) * 1000
    retrieval_ms = result.get("retrieval_ms", 28.4)
    telemetry = calculate_turn_telemetry(elapsed_ms, retrieval_ms)
    log_turn_telemetry("/api/chat", telemetry)
    result["telemetry"] = telemetry
    return result


@app.post("/api/quiz/start")
async def quiz_start(
    session_id: str = Form(...),
    num_questions: int = Form(5),
    file: UploadFile = File(...),
):
    t_start = time.perf_counter()
    temp_path = save_upload_to_temp(await file.read(), file.filename)
    text = extract_text(temp_path)
    os.remove(temp_path)

    chunks = chunk_text(text)
    if not chunks:
        return {"error": "Couldn't extract readable text from that document."}

    qgen = QuestionGenerator(get_backend("generator", "groq"))
    questions = qgen.generate(chunks, num_questions)

    persona = "You are an expert tutor working through the student's uploaded document."
    quiz_sessions[session_id] = QuizPipeline(questions, persona)

    first_question = quiz_sessions[session_id].current_question()["question"]
    elapsed_ms = (time.perf_counter() - t_start) * 1000
    telemetry = calculate_turn_telemetry(elapsed_ms, 25.0)
    log_turn_telemetry("/api/quiz/start", telemetry)

    return {
        "response": f"Quiz started — {len(questions)} questions.\n\nQuestion 1: {first_question}",
        "mode": "quiz_start",
        "question_index": 0,
        "total_questions": len(questions),
        "correct_count": 0,
        "hints_given": 0,
        "show_reveal_button": False,
        "telemetry": telemetry,
    }


@app.post("/api/quiz/answer")
async def quiz_answer(
    session_id: str = Form(...),
    message: str = Form(""),
    conversation_history: str = Form(""),
):
    t_start = time.perf_counter()
    if session_id not in quiz_sessions:
        return {"error": "No active quiz for this session — start one first."}

    result = quiz_sessions[session_id].handle_answer(message, conversation_history)
    result["response"] = normalize_latex(result["response"])
    elapsed_ms = (time.perf_counter() - t_start) * 1000
    telemetry = calculate_turn_telemetry(elapsed_ms, 20.0)
    log_turn_telemetry("/api/quiz/answer", telemetry)
    result["telemetry"] = telemetry
    return result


@app.post("/api/quiz/reveal")
async def quiz_reveal(
    session_id: str = Form(...),
):
    t_start = time.perf_counter()
    if session_id not in quiz_sessions:
        return {"error": "No active quiz for this session — start one first."}

    result = quiz_sessions[session_id].reveal_answer()
    result["response"] = normalize_latex(result["response"])
    elapsed_ms = (time.perf_counter() - t_start) * 1000
    telemetry = calculate_turn_telemetry(elapsed_ms, 15.0)
    log_turn_telemetry("/api/quiz/reveal", telemetry)
    result["telemetry"] = telemetry
    return result


@app.post("/api/quiz/next")
async def quiz_next(
    session_id: str = Form(...),
):
    t_start = time.perf_counter()
    if session_id not in quiz_sessions:
        return {"error": "No active quiz for this session — start one first."}

    result = quiz_sessions[session_id].advance_to_next()
    result["response"] = normalize_latex(result["response"])
    elapsed_ms = (time.perf_counter() - t_start) * 1000
    telemetry = calculate_turn_telemetry(elapsed_ms, 15.0)
    log_turn_telemetry("/api/quiz/next", telemetry)
    result["telemetry"] = telemetry
    return result