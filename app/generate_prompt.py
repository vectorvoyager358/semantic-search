from app.faiss_search import search_faiss

def generate_prompt(query: str, index, store, top_k: int = 3) -> str:

    search_results = search_faiss(query, index, store, top_k)

    texts = [result['text'] for result in search_results]
    context = "\n\n".join(texts)

    prompt = f"""You are a helpful assistant that answers questions using the provided context as well as your general knowledge. Use the context to answer the question as best as you can. If the context does not contain relevant information, answer based on your general knowledge. Always try to use the context if it is relevant.\n\n
    context:\n\n{context}\n\nQuestion: {query}\nAnswer:"""

    return prompt