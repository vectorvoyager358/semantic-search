from google import genai
from dotenv import load_dotenv
import os
from app.generate_prompt import generate_prompt
from app.search_pinecone import search_pinecone

load_dotenv()

client = genai.Client(api_key = os.getenv("GOOGLE_API_KEY"))

def rag_output(query: str, session_id: str, top_k: int = 3):
    search_results = search_pinecone(query, session_id, top_k)
    texts = [result['text'] for result in search_results]
    context = "\n\n".join(texts)

    prompt = generate_prompt(context, query)
    sources = []
    for source in search_results:
        sources.append({
            "text": source['text'],
            "doc_id": source['doc_id'],
            "chunk_id": source['chunk_id'],
            "distance": source['score']
        })
    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=prompt
    )

    return response.text, sources