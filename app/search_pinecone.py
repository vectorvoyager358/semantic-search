from app.embedder import get_embedding
from app.pinecone_store import get_pinecone_index

def search_pinecone(query: str, session_id, top_k: int = 3):
    index = get_pinecone_index()
    query_embedding = get_embedding(query)

    response = index.query(
        vector=query_embedding,
        top_k=top_k,
        include_metadata=True,
        filter={"session_id": session_id}
    )

    results = []
    for match in response.matches:
        metadata = match.metadata
        results.append({
            "text": metadata["text"],
            "doc_id": metadata["doc_id"],
            "chunk_id": metadata["chunk_id"],
            "score": match.score
        })

    return results