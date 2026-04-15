from sentence_transformers import SentenceTransformer

embedding_model = SentenceTransformer("BAAI/bge-small-en-v1.5")


def get_embedding(text: str):
    embedding = embedding_model.encode(text, normalize_embeddings=True)
    return embedding.tolist()


