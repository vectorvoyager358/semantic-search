from fastapi import FastAPI, UploadFile, File, HTTPException, Response
from pydantic import BaseModel
import os
import uuid
from typing import List
from dotenv import load_dotenv
from app.session_store import sessions
from app.settings import CHUNK_SIZE, OVERLAP_SIZE
from app.rag_output import rag_output
from app.pinecone_store import upsert_chunks, delete_session_vectors
from app.chunking import store_creation
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# Comma-separated list, e.g. "http://localhost:5173,https://your-app.vercel.app"
_cors_origins_env = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
CORS_ORIGINS = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
class AskRequest(BaseModel):
    query: str

class SourceResponse(BaseModel):
    text: str
    doc_id: int
    chunk_id: int
    distance: float
class AskResponse(BaseModel):
    answer: str
    sources: List[SourceResponse]

class SessionResponse(BaseModel):
    session_id: str


class SessionInfoResponse(BaseModel):
    session_id: str
    document_count: int


@app.get("/")
def root():
    return {"message": "RAG API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/sessions/{session_id}/ask", response_model=AskResponse)
def ask_question(request: AskRequest, session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    if not sessions[session_id]["documents"]:
        raise HTTPException(status_code=400, detail="Session has no indexed documents")

    answer, sources = rag_output(request.query, session_id)
    return AskResponse(answer=answer, sources=sources)

@app.get("/sessions/{session_id}", response_model=SessionInfoResponse)
def get_session(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    doc_count = len(sessions[session_id]["documents"])
    return SessionInfoResponse(session_id=session_id, document_count=doc_count)


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    # Vectors are only upserted after /documents uploads; skip Pinecone if none.
    had_indexed_documents = len(sessions[session_id]["documents"]) > 0
    del sessions[session_id]
    if had_indexed_documents:
        try:
            delete_session_vectors(session_id)
        except Exception:
            pass
    return Response(status_code=204)


@app.post("/sessions", response_model=SessionResponse)
def create_session():
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "documents": []
    }
    return SessionResponse(session_id=session_id)

@app.post("/sessions/{session_id}/documents")
def upload_document(session_id: str, file: UploadFile = File(...)):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    if not file.filename.endswith(".txt"):
        raise HTTPException(status_code=400, detail = "Only .txt files are supported")
    
    content = file.file.read().decode("utf-8")

    sessions[session_id]["documents"].append(content)
    store = store_creation([content], chunk_size=CHUNK_SIZE, overlap_size=OVERLAP_SIZE)
    upsert_chunks(session_id, store)
    return {"message": "Document uploaded and indexed successfully"}