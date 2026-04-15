import requests


def generate_response(prompt: str):
    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "gemma4:latest",
            "prompt": prompt,
            "stream": False
        }
    )

    data = response.json()

    if "response" not in data:
        raise ValueError(f"Ollama error: {data}")

    return data["response"]