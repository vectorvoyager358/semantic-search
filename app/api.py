from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
import uuid
from typing import List
from app.session_store import sessions

from app.faiss_store import load_documents_from_folder, store_creation, build_faiss_index
from app.output import rag_output


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
    if sessions[session_id]["index"] is None or not sessions[session_id]["store"]:
        raise HTTPException(status_code=400, detail="Session has no indexed documents")
    session_index = sessions[session_id]["index"]
    session_store = sessions[session_id]["store"]
    answer, sources = rag_output(request.query, session_index, session_store, top_k=3)
    return AskResponse(answer=answer, sources=sources)

@app.post("/sessions", response_model=SessionResponse)
def create_session():
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "store": [],
        "index": None,
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
    sessions[session_id]["store"] = store_creation(sessions[session_id]["documents"], chunk_size=3, overlap_size=1)
    sessions[session_id]["index"] = build_faiss_index(sessions[session_id]["store"])
    return {"message": "Document uploaded and indexed successfully"}