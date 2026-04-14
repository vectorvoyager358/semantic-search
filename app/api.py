from fastapi import FastAPI
from pydantic import BaseModel

from app.faiss_store import load_documents_from_folder, store_creation, build_faiss_index
from app.output import rag_output


app = FastAPI()


class AskRequest(BaseModel):
    query: str


class AskResponse(BaseModel):
    answer: str

docs = load_documents_from_folder("data")
store = store_creation(docs, chunk_size=3, overlap_size=1)
index, store = build_faiss_index(store)


@app.get("/")
def root():
    return {"message": "RAG API is running"}


@app.post("/ask", response_model=AskResponse)
def ask_question(request: AskRequest):
    answer = rag_output(request.query, index, store, top_k=3)
    return AskResponse(answer=answer)