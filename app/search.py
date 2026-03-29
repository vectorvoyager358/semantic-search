import numpy as np
from app.embedder import get_embedding

def cosine_similarity(a: list, b: list) -> float:
    """Compute cosine similarity between two vectors."""
    a, b = np.array(a), np.array(b)
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

def search(query: str, store: list, top_k: int = 2) -> list:
    """Return top_k most similar documents for a query."""
    query_embedding = get_embedding(query)
    scores = [(item["text"], cosine_similarity(query_embedding, item["embedding"]))
              for item in store]
    scores.sort(key=lambda x: x[1], reverse=True)
    return scores[:top_k]