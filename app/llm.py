import requests
import os
from dotenv import load_dotenv

load_dotenv()


def generate_response(prompt: str):
    response = requests.post(
        os.getenv("LLM_URL", "http://localhost:11434/api/generate"),
        json={
            "model": os.getenv("LLM_MODEL", "qwen2.5:7b"),
            "prompt": prompt,
            "stream": False
        },
        timeout=120
    )

    response.raise_for_status()
    data = response.json()

    if "response" not in data:
        raise ValueError(f"Ollama error: {data}")

    return data["response"]