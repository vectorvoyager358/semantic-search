import numpy as np

from app.embedder import get_embedding


def search_faiss(query: str, index, store, top_k: int = 3):
    """
    Search the FAISS index and return top_k matching documents.
    """
    query_embedding = np.array([get_embedding(query)]).astype("float32")

    distances, indices = index.search(query_embedding, top_k)

    results = []
    for rank, idx in enumerate(indices[0]):
        results.append({
            "text": store[idx]['text'],
            "doc_id": store[idx]['doc_id'],
            "chunk_id": store[idx]['chunk_id'],
            "distance": float(distances[0][rank])
        })

    return results