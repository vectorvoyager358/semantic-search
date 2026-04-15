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
                "text": item["text"],
                "doc_id": item["doc_id"],
                "chunk_id": item["chunk_id"]
            }
        }
        records.append(record)
    index.upsert(records)


