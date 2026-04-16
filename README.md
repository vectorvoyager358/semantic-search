# Document Chat RAG

Session-based RAG (retrieval-augmented generation) over plain-text documents: upload `.txt` files, chunk and embed them, store vectors in **Pinecone**, retrieve relevant chunks for a question, and answer with an **LLM** (defaults to **Ollama**-compatible HTTP API).

---

## What’s included

- **Backend (FastAPI):** sessions, document upload, ask endpoint, optional Pinecone cleanup on delete.
- **Frontend (Vite + React + TypeScript):** sidebar notebooks, chat thread, composer with upload and send, rename/delete per session, client-side persistence for the active session and chat history in a tab.
- **Embeddings:** `sentence-transformers` (e.g. BGE) for chunk vectors; Pinecone for similarity search.

---

## Prerequisites

- Python 3.10+ (recommended)
- Node.js 18+ (for the frontend)
- A **Pinecone** index configured for the embedding dimension your model produces.
- An **LLM** reachable at `LLM_URL` (default assumes Ollama-style `POST .../api/generate`).

---

## Environment

Copy `.env.example` to `.env` and set:

| Variable | Purpose |
|----------|---------|
| `PINECONE_API_KEY` | Pinecone API key |
| `PINECONE_INDEX_NAME` | Target index name |
| `LLM_URL` | LLM HTTP endpoint (default: `http://localhost:11434/api/generate`) |
| `LLM_MODEL` | Model name (default: `qwen2.5:7b`) |

---

## Backend setup and run

```bash
pip install -r requirements.txt
uvicorn app.api:app --reload --host 127.0.0.1 --port 8000
```

API base URL used by the current frontend: `http://127.0.0.1:8000`.

### Main HTTP routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health message |
| `POST` | `/sessions` | Create a new session (UUID) |
| `GET` | `/sessions/{session_id}` | Session metadata (`document_count`) |
| `DELETE` | `/sessions/{session_id}` | Remove session; deletes Pinecone vectors only if at least one document was uploaded |
| `POST` | `/sessions/{session_id}/documents` | Upload a `.txt` file; chunk, embed, upsert to Pinecone |
| `POST` | `/sessions/{session_id}/ask` | RAG question; requires indexed documents |

For local dev, CORS defaults to `http://localhost:5173` and `http://127.0.0.1:5173`. For a hosted frontend (e.g. Vercel/Netlify), set **`CORS_ORIGINS`** in the API environment to a comma-separated list of exact origins (e.g. `https://your-app.vercel.app`). The production site must call the API over **HTTPS** if the page is HTTPS (avoid mixed content).

---

## Frontend

See **`frontend/README.md`** for install, dev server, and UI behavior.

Typical flow:

```bash
cd frontend
npm install
npm run dev
```

Open the printed URL (usually `http://localhost:5173`).

---

## Important limitations

- **Server sessions are in-memory.** Restarting the API clears all sessions; Pinecone may still hold old vectors until you delete sessions from the UI or reindex.
- The **frontend** keeps a notebook list in **`localStorage`** and the active session id plus chat turns in **`sessionStorage`** (per browser tab). The app **reconciles** the list with `GET /sessions/{id}` on load and after creating a notebook so stale ids disappear after a server restart.
- Only **`.txt`** uploads are supported in the current API.

---

## Project layout (high level)

```
app/
  api.py              # FastAPI routes
  session_store.py    # In-memory session dict
  chunking.py         # Text chunking
  embedder.py         # Embeddings
  pinecone_store.py   # Upsert / delete-by-metadata
  search_pinecone.py
  rag_output.py
  generate_prompt.py
  llm.py
frontend/             # React UI
```

---

## License

See `LICENSE` in the repository root.
