# Document Chat — frontend

Vite + React + TypeScript client for the **Document Chat RAG** API. The UI is a minimal chat layout: **sidebar** (notebooks), **main** conversation, **bottom composer** (attach `.txt`, type a message, send).

---

## Commands

```bash
npm install
npm run dev
```

Development server defaults to `http://localhost:5173`. The app expects the API at **`http://127.0.0.1:8000`** (see `API_BASE` in `src/App.tsx`).

```bash
npm run build
```

Outputs a production bundle to `dist/`.

---

## UI overview

- **Sidebar:** “Document Chat” title, **+ New notebook**, and a **Sessions** list. Each row shows the notebook name (auto-generated phrase or a name you set). The **more** menu (three dots) on each row has **Rename** (inline editor) and **Delete** (confirms, then calls `DELETE /sessions/{id}` on the server).
- **Main area:** Chat bubbles (you / assistant), optional **Sources** sections on replies, **Clear chat** when there is history. You can **drag and drop** a `.txt` onto the scroll area to upload.
- **Composer:** **+** opens a file picker (`.txt` only); upload runs immediately. Text field + **send**; **Ctrl+Enter** / **Cmd+Enter** sends.

---

## Client-side persistence

| Storage | What |
|---------|------|
| `sessionStorage` | Active session id, chat turns per session id, optional custom notebook name per id |
| `localStorage` | Ordered list of session ids for the sidebar |

Refreshing the **same tab** keeps the active session and chat history **if** the server still has that session. **Closing the tab** clears `sessionStorage` for that tab; the list in `localStorage` may still show ids until the app **reconciles** them with `GET /sessions/{id}` (on load and after **New notebook**).

If the API was restarted, old ids may 404 until reconciliation removes them from the list.

---

## Changing the API URL

Edit `API_BASE` in `src/App.tsx` (or refactor to `import.meta.env` if you add a Vite env variable). Ensure the backend CORS settings allow your frontend origin.
