from app.embedder import get_embedding

def load_documents(file_path: str) -> list:
    """Load documents from file."""
    with open(file_path, "r") as f:
        return [line.strip() for line in f.readlines() if line.strip()]

def create_embedding_store(docs: list) -> list:
    """Create a store of documents and their embeddings."""
    store = []
    for doc in docs:
        embedding = get_embedding(doc)
        store.append({"text": doc, "embedding": embedding})
    return store