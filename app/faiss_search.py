import numpy as np

from app.embedder import get_embedding


def search_faiss(query: str, index, documents: list, top_k: int = 2):
    """
    Search the FAISS index and return top_k matching documents.
    """
    query_embedding = np.array([get_embedding(query)]).astype("float32")

    distances, indices = index.search(query_embedding, top_k)

    results = []
    for rank, idx in enumerate(indices[0]):
        results.append({
            "text": documents[idx],
            "distance": float(distances[0][rank])
        })

    return results