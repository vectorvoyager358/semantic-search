from app.store import load_documents
from app.faiss_store import build_faiss_index
from app.faiss_search import search_faiss


def main():
    docs = load_documents("data/documents.txt")
    index, documents, _ = build_faiss_index(docs)

    print("\n=== Semantic Search with FAISS ===")

    while True:
        query = input("\nEnter query (or 'exit'): ")
        if query.lower() == "exit":
            break

        results = search_faiss(query, index, documents, top_k=2)

        print("\nTop Results:")
        for item in results:
            print(f"- {item['text']} (distance: {item['distance']:.4f})")


if __name__ == "__main__":
    main()