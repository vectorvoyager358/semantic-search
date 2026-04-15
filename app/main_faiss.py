from app.faiss_store import load_documents_from_folder, store_creation, build_faiss_index
from app.output import rag_output


def main():
    docs = load_documents_from_folder("data")
    store = store_creation(docs, chunk_size=3, overlap_size=1)
    index = build_faiss_index(store)

    print(f"\nLoaded {len(docs)} documents")
    print(f"Created {len(store)} chunk records")
    print(f"first three records in store {store[0:3]}")
    print("\n=== RAG with FAISS ===")

    while True:
        query = input("\nEnter your query (or 'exit'): ").strip()

        if query.lower() == "exit":
            print("Goodbye.")
            break

        answer = rag_output(query, index, store, top_k=3)
        print("\nAnswer:\n")
        print(answer)


if __name__ == "__main__":
    main()