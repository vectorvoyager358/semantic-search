from pinecone import Pinecone 
from dotenv import load_dotenv
import os

load_dotenv()

def get_pinecone_index():
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index = pc.Index(os.getenv("PINECONE_INDEX_NAME"))
    return index

def upsert_chunks(session_id, store):
    index = get_pinecone_index()
    records = []
    for item in store:
        record = {
            "id": f"{session_id}_{item['doc_id']}_{item['chunk_id']}",
            "values": item["embedding"],
            "metadata": {
                "session_id": session_id,
                "text": item["text"],
                "doc_id": item["doc_id"],
                "chunk_id": item["chunk_id"]
            }
        }
        records.append(record)

    index.upsert(vectors=records)


def delete_session_vectors(session_id: str) -> None:
    """Remove all vectors tagged with this session_id from the index."""
    index = get_pinecone_index()
    index.delete(filter={"session_id": session_id})

