from app.store import load_documents, create_embedding_store
from app.search import search

def main():
    docs = load_documents("data/documents.txt")
    store = create_embedding_store(docs)

    print("\n=== Semantic Search Engine ===")

    while True:
        query = input("\nEnter query (or 'exit'): ")
        if query.lower() == "exit":
            break

        results = search(query, store)
        print("\nTop Results:")
        for text, score in results:
            print(f"- {text} (score: {score:.4f})")

if __name__ == "__main__":
    main()