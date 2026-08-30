"""
FastAPI wrapper over TutorPipeline. Next.js frontend calls this.
"""

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
load_dotenv()

from agents.pipeline import TutorPipeline
from utils.input_handler import extract_text_from_image
from utils.latex_fix import normalize_latex

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

sessions: dict[str, TutorPipeline] = {}


@app.post("/api/chat")
async def chat(
    session_id: str = Form(...),
    message: str = Form(""),
    conversation_history: str = Form(""),
    file: UploadFile | None = File(None),
):
    if file:
        temp_path = f"/tmp/{file.filename}"
        with open(temp_path, "wb") as f:
            f.write(await file.read())
        extracted = extract_text_from_image(temp_path)
        message = f"{message}\n[From image]: {extracted}".strip() if message else extracted

    if session_id not in sessions:
        sessions[session_id] = TutorPipeline(backend_name="groq")

    result = sessions[session_id].handle_turn(message, conversation_history)
    result["response"] = normalize_latex(result["response"])
    return result