import requests
import os
from dotenv import load_dotenv

load_dotenv()


def generate_response(prompt: str):
    url = os.getenv("LLM_URL", "http://ollama:11434/api/generate")
    model = os.getenv("LLM_MODEL", "qwen2.5:3b")

    response = requests.post(
        url,
        json={
            "model": model,
            "prompt": prompt,
            "stream": False
        },
        timeout=120
    )

    data = response.json()

    if not response.ok:
        raise ValueError(f"Ollama error for model '{model}': {data}")

    if "response" not in data:
        raise ValueError(f"Unexpected Ollama response: {data}")

    return data["response"]