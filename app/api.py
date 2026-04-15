from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
import uuid
from typing import List
from app.session_store import sessions
from app.settings import CHUNK_SIZE, OVERLAP_SIZE
from app.rag_output import rag_output
from app.pinecone_store import upsert_chunks
from app.chunking import store_creation


app = FastAPI()


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


@app.get("/")
def root():
    return {"message": "RAG API is running"}


@app.post("/sessions/{session_id}/ask", response_model=AskResponse)
def ask_question(request: AskRequest, session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    if not sessions[session_id]["documents"]:
        raise HTTPException(status_code=400, detail="Session has no indexed documents")

    answer, sources = rag_output(request.query, session_id)
    return AskResponse(answer=answer, sources=sources)

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