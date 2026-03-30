import faiss
import numpy as np

from app.embedder import get_embedding

def build_faiss_index(docs: list):
    """
    Build a FAISS index from document embeddings.
    Returns:
        index: FAISS index object
        documents: original documents list
        embeddings_matrix: numpy matrix of embeddings
    """

    embeddings = [get_embedding(doc) for doc in docs]
    embeddings_matrix = np.array(embeddings).astype('float32')
    dimension = embeddings_matrix.shape[1]

    index = faiss.IndexFlatL2(dimension)
    index.add(embeddings_matrix)
    return index, docs, embeddings_matrix
