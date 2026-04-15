from google import genai
from dotenv import load_dotenv
import os
from app.generate_prompt import generate_prompt
from app.faiss_search import search_faiss

load_dotenv()

client = genai.Client(api_key = os.getenv("GOOGLE_API_KEY"))

def rag_output(query: str, index, store, top_k: int = 3):
    search_results = search_faiss(query, index, store, top_k)
    texts = [result['text'] for result in search_results]
    context = "\n\n".join(texts)

    prompt = generate_prompt(context, query)
    sources = []
    for source in search_results:
        sources.append({
            "text": source['text'],
            "doc_id": source['doc_id'],
            "chunk_id": source['chunk_id'],
            "distance": source['distance']
        })
    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=prompt
    )

    return response.text, sources