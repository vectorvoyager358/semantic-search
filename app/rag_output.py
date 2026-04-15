from app.generate_prompt import generate_prompt
from app.search_pinecone import search_pinecone
from app.settings import RETRIEVAL_TOP_K, FINAL_CONTEXT_K
from app.llm import generate_response

def rag_output(query: str, session_id: str):
    search_results = search_pinecone(query, session_id, top_k=RETRIEVAL_TOP_K)
    top_results = search_results[:FINAL_CONTEXT_K]
    texts = [result['text'] for result in top_results]
    context = "\n\n".join(texts)

    prompt = generate_prompt(context, query)
    sources = []
    for source in top_results:
        sources.append({
            "text": source['text'],
            "doc_id": source['doc_id'],
            "chunk_id": source['chunk_id'],
            "distance": source['score']
        })
    answer = generate_response(prompt)

    return answer, sources