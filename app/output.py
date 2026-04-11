from google import genai
from dotenv import load_dotenv
import os
from app.generate_prompt import generate_prompt

load_dotenv()

client = genai.Client(api_key = os.getenv("GENAI_API_KEY"))

def rag_output(query: str, index, store, top_k: int = 3):
    prompt = generate_prompt(query, index, store, top_k)

    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=prompt
    )

    return response.text