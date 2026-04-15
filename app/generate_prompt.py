def generate_prompt(context, query):
    prompt = f"""
You are a helpful assistant.

Answer the question using only the provided context.
If the answer is not present in the context, say:
"I could not find the answer in the uploaded documents."

Context:
{context}

Question:
{query}

Answer:
"""
    return prompt.strip()