import faiss
import numpy as np
import re
from pathlib import Path

from app.embedder import get_embedding

def load_documents_from_folder(folder_path: str) -> list[str]:
    """
    Read all .txt files from a folder and return their contents as a list.
    Each file is treated as one document.
    """
    documents = []

    folder = Path(folder_path)

    for file_path in folder.glob("*.txt"):
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read().strip()
            if text:
                documents.append(text)

    return documents


def split_into_sentences(text: str) -> list[str]:
    """
    Split text into sentences using ., ?, ! as sentence boundaries.
    """
    sentences = re.split(r"[.!?]+", text)
    sentences = [sentence.strip() for sentence in sentences if sentence.strip()]
    return sentences


def store_creation(docs: list, chunk_size, overlap_size):
    store = []

    for doc_id, doc in enumerate(docs):
        sentences = split_into_sentences(doc)

        chunks = []
        step = chunk_size - overlap_size

        for i in range(0, len(sentences), step):
            chunk_sentences = sentences[i:i + chunk_size]

            if not chunk_sentences:
                continue

            chunk = " ".join(chunk_sentences)
            chunks.append(chunk)

            if i + chunk_size >= len(sentences):
                break

        for chunk_id, chunk in enumerate(chunks):
            embedding = get_embedding(chunk)

            chunk_data = {
                "doc_id": doc_id,
                "chunk_id": chunk_id,
                "text": chunk,
                "embedding": embedding
            }

            store.append(chunk_data)

    return store

def build_faiss_index(store):
    embedding_list = []
    for item in store:
        embedding = item["embedding"]
        embedding_list.append(embedding)
    embedding_matrix = np.array(embedding_list).astype("float32")
    dimension = embedding_matrix.shape[1]
    index = faiss.IndexFlatL2(dimension)
    index.add(embedding_matrix)
    return index

