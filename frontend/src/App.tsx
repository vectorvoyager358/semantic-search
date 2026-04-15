import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import "./App.css";

type Source = {
  text: string;
  doc_id: number;
  chunk_id: number;
  distance?: number;
};

type ChatTurn =
  | { id: string; query: string; status: "pending" }
  | {
      id: string;
      query: string;
      status: "done";
      answer: string;
      sources: Source[];
    }
  | { id: string; query: string; status: "error"; message: string };

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function MoreVerticalIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

const NOTEBOOK_ADJECTIVES = [
  "Calm",
  "Quiet",
  "Bright",
  "Gentle",
  "Clever",
  "Swift",
  "Steady",
  "Bold",
  "Soft",
  "Keen",
  "Fair",
  "Warm",
  "Clear",
  "Deep",
  "Kind",
] as const;

const NOTEBOOK_NOUNS = [
  "Harbor",
  "Meadow",
  "Canyon",
  "Ridge",
  "Brook",
  "Summit",
  "Grove",
  "Shore",
  "Field",
  "Creek",
  "Basin",
  "Dune",
  "Glade",
  "Fjord",
  "Marsh",
] as const;

function notebookNameFromSessionId(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  const a = NOTEBOOK_ADJECTIVES[u % NOTEBOOK_ADJECTIVES.length];
  const b = NOTEBOOK_NOUNS[(u >>> 8) % NOTEBOOK_NOUNS.length];
  return `${a} ${b}`;
}

const STORAGE_SESSION_KEY = "document-chat-rag-session-id";
const SESSION_LIST_KEY = "document-chat-rag-session-list";
const MAX_SESSIONS_IN_LIST = 40;

function turnsStorageKey(sessionId: string): string {
  return `document-chat-rag-turns:${sessionId}`;
}

function notebookCustomNameKey(sessionId: string): string {
  return `document-chat-rag-notebook-custom:${sessionId}`;
}

function readSessionList(): string[] {
  try {
    const raw = localStorage.getItem(SESSION_LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writeSessionList(ids: string[]) {
  localStorage.setItem(
    SESSION_LIST_KEY,
    JSON.stringify(ids.slice(0, MAX_SESSIONS_IN_LIST)),
  );
}

function addSessionToList(id: string) {
  const next = [id, ...readSessionList().filter((x) => x !== id)];
  writeSessionList(next);
}

function removeSessionFromList(id: string) {
  writeSessionList(readSessionList().filter((x) => x !== id));
}

function clearSessionClientStorage(id: string): void {
  sessionStorage.removeItem(turnsStorageKey(id));
  sessionStorage.removeItem(notebookCustomNameKey(id));
}

function getDisplayNameForSession(id: string): string {
  const custom = sessionStorage.getItem(notebookCustomNameKey(id))?.trim();
  if (custom) return custom;
  return notebookNameFromSessionId(id);
}

function isChatTurn(v: unknown): v is ChatTurn {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    typeof o.query !== "string" ||
    typeof o.status !== "string"
  ) {
    return false;
  }
  if (o.status === "pending") return true;
  if (o.status === "error") return typeof o.message === "string";
  if (o.status === "done") {
    return typeof o.answer === "string" && Array.isArray(o.sources);
  }
  return false;
}

function sanitizeTurns(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatTurn[] = [];
  for (const item of raw) {
    if (!isChatTurn(item)) continue;
    if (item.status === "pending") {
      out.push({
        id: item.id,
        query: item.query,
        status: "error",
        message: "This reply was interrupted (e.g. refresh). Ask again.",
      });
      continue;
    }
    out.push(item);
  }
  return out;
}

function loadTurnsFromStorage(sessionId: string): ChatTurn[] {
  try {
    const raw = sessionStorage.getItem(turnsStorageKey(sessionId));
    if (!raw) return [];
    return sanitizeTurns(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

type SessionBootstrap = { sessionId: string; turns: ChatTurn[] };

let sessionBootstrapPromise: Promise<SessionBootstrap> | null = null;

function bootstrapSession(apiBase: string): Promise<SessionBootstrap> {
  if (!sessionBootstrapPromise) {
    sessionBootstrapPromise = (async (): Promise<SessionBootstrap> => {
      const stored = sessionStorage.getItem(STORAGE_SESSION_KEY);
      if (stored) {
        const check = await fetch(`${apiBase}/sessions/${stored}`);
        if (check.ok) {
          return { sessionId: stored, turns: loadTurnsFromStorage(stored) };
        }
        sessionStorage.removeItem(STORAGE_SESSION_KEY);
        sessionStorage.removeItem(turnsStorageKey(stored));
        sessionStorage.removeItem(notebookCustomNameKey(stored));
        removeSessionFromList(stored);
      }

      const res = await fetch(`${apiBase}/sessions`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to create session");
      const data = await res.json();
      const id = data.session_id as string;
      sessionStorage.setItem(STORAGE_SESSION_KEY, id);
      return { sessionId: id, turns: [] };
    })().catch((err: unknown) => {
      sessionBootstrapPromise = null;
      throw err;
    });
  }
  return sessionBootstrapPromise;
}

/**
 * Session ids in localStorage survive browser restarts; the API keeps sessions in memory only.
 * Drop list entries that return 404 and clear their client storage so the sidebar matches the server.
 */
async function reconcileSessionListWithServer(
  apiBase: string,
  preferredActiveId: string,
): Promise<string[]> {
  const raw = readSessionList();
  const seen = new Set<string>();
  const orderedUnique = raw.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const okIds = new Set<string>();
  await Promise.all(
    orderedUnique.map(async (id) => {
      try {
        const res = await fetch(`${apiBase}/sessions/${id}`);
        if (res.ok) okIds.add(id);
      } catch {
        /* offline or error — treat as gone */
      }
    }),
  );

  for (const id of orderedUnique) {
    if (!okIds.has(id)) {
      clearSessionClientStorage(id);
    }
  }

  const pruned = orderedUnique.filter((id) => okIds.has(id));
  const next = pruned.includes(preferredActiveId)
    ? pruned
    : [preferredActiveId, ...pruned.filter((x) => x !== preferredActiveId)];

  writeSessionList(next);
  return next;
}

function App() {
  const [sessionId, setSessionId] = useState<string>("");
  const [sessionList, setSessionList] = useState<string[]>([]);
  const [query, setQuery] = useState<string>("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [uploadLoading, setUploadLoading] = useState<boolean>(false);
  const [askLoading, setAskLoading] = useState<boolean>(false);
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [copyId, setCopyId] = useState<string | null>(null);
  const [mainDragActive, setMainDragActive] = useState<boolean>(false);
  const [notebookCustomName, setNotebookCustomName] = useState<string>("");
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  );
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | null>(
    null,
  );
  const [renameDraft, setRenameDraft] = useState<string>("");

  const renameInputId = useId();
  const composerFileInputId = useId();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const composerFileInputRef = useRef<HTMLInputElement>(null);

  const API_BASE = "http://127.0.0.1:8000";

  const createNewNotebook = async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to create session");
      const data = await res.json();
      const id = data.session_id as string;
      addSessionToList(id);
      sessionStorage.setItem(STORAGE_SESSION_KEY, id);
      const validList = await reconcileSessionListWithServer(API_BASE, id);
      setSessionList(validList);
      setSessionId(id);
      setTurns([]);
      setNotebookCustomName("");
      setRenamingSessionId(null);
      setOpenMenuSessionId(null);
      setUploadMessage("");
    } catch (e) {
      console.error(e);
    }
  };

  const selectSession = async (id: string) => {
    if (id === sessionId) return;
    setOpenMenuSessionId(null);
    const check = await fetch(`${API_BASE}/sessions/${id}`);
    if (!check.ok) {
      removeSessionFromList(id);
      const list = readSessionList();
      setSessionList(list);
      if (sessionId === id) {
        if (list[0]) {
          sessionStorage.setItem(STORAGE_SESSION_KEY, list[0]);
          setSessionId(list[0]);
          setTurns(loadTurnsFromStorage(list[0]));
          setNotebookCustomName(
            sessionStorage.getItem(notebookCustomNameKey(list[0])) ?? "",
          );
        } else {
          await createNewNotebook();
        }
      }
      return;
    }
    sessionStorage.setItem(STORAGE_SESSION_KEY, id);
    setSessionId(id);
    setTurns(loadTurnsFromStorage(id));
    setNotebookCustomName(
      sessionStorage.getItem(notebookCustomNameKey(id)) ?? "",
    );
    setUploadMessage("");
  };

  useEffect(() => {
    let cancelled = false;
    bootstrapSession(API_BASE)
      .then(async (result) => {
        if (cancelled) return;
        let sid = result.sessionId;
        let restored = result.turns;
        const latest = sessionStorage.getItem(STORAGE_SESSION_KEY);
        if (latest && latest !== sid) {
          sid = latest;
          restored = loadTurnsFromStorage(latest);
        }
        addSessionToList(sid);
        const validList = await reconcileSessionListWithServer(API_BASE, sid);
        if (cancelled) return;
        setSessionList(validList);
        setSessionId(sid);
        setTurns(restored);
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error("Failed to init session:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setNotebookCustomName("");
      return;
    }
    setNotebookCustomName(
      sessionStorage.getItem(notebookCustomNameKey(sessionId)) ?? "",
    );
  }, [sessionId]);

  useEffect(() => {
    if (renamingSessionId === null) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingSessionId]);

  useEffect(() => {
    if (openMenuSessionId === null) return;
    const onDocMouseDown = (e: globalThis.MouseEvent) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (!el.closest("[data-session-menu-root]")) {
        setOpenMenuSessionId(null);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [openMenuSessionId]);

  useEffect(() => {
    if (!sessionId) return;
    try {
      sessionStorage.setItem(
        turnsStorageKey(sessionId),
        JSON.stringify(turns),
      );
    } catch {
      /* storage full or disabled */
    }
  }, [sessionId, turns]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, askLoading]);

  useEffect(() => {
    if (!copyId) return;
    const t = window.setTimeout(() => setCopyId(null), 2000);
    return () => window.clearTimeout(t);
  }, [copyId]);

  const performUpload = async (f: File) => {
    if (!sessionId) return;
    if (!f.name.toLowerCase().endsWith(".txt")) {
      setUploadMessage("Only .txt files are supported.");
      return;
    }
    setUploadLoading(true);
    setUploadMessage("");
    try {
      const formData = new FormData();
      formData.append("file", f);
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/documents`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setUploadMessage(data.message || "Uploaded.");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Upload failed";
      setUploadMessage(msg);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleComposerFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void performUpload(f);
  };

  const handleMainDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMainDragActive(true);
  };

  const handleMainDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMainDragActive(false);
  };

  const handleMainDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMainDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) void performUpload(dropped);
  };

  const handleAsk = async () => {
    if (!query.trim() || !sessionId) return;

    const q = query.trim();
    const id = crypto.randomUUID();
    setTurns((t) => [...t, { id, query: q, status: "pending" }]);
    setQuery("");
    setAskLoading(true);

    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: q }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Question failed");
      }

      setTurns((t) =>
        t.map((turn) =>
          turn.id === id
            ? {
                id,
                query: q,
                status: "done",
                answer: data.answer,
                sources: data.sources || [],
              }
            : turn,
        ),
      );
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Something went wrong";
      setTurns((t) =>
        t.map((turn) =>
          turn.id === id ? { id, query: q, status: "error", message: msg } : turn,
        ),
      );
    } finally {
      setAskLoading(false);
    }
  };

  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    if (!(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    if (!askLoading && query.trim()) void handleAsk();
  };

  const clearChat = () => setTurns([]);

  const copyAnswer = async (turnId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyId(turnId);
    } catch {
      setCopyId(null);
    }
  };

  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);

  const notebookTitle =
    sessionId && notebookCustomName.trim()
      ? notebookCustomName.trim()
      : sessionId
        ? notebookNameFromSessionId(sessionId)
        : "";

  const openSessionMenu = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    setOpenMenuSessionId((prev) => (prev === id ? null : id));
  };

  const startRenameForSession = (id: string) => {
    setOpenMenuSessionId(null);
    setRenamingSessionId(id);
    setRenameDraft(getDisplayNameForSession(id));
  };

  const cancelRename = () => {
    setRenamingSessionId(null);
    setRenameDraft("");
  };

  const commitRename = () => {
    const target = renamingSessionId;
    if (!target) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      sessionStorage.removeItem(notebookCustomNameKey(target));
      if (target === sessionId) setNotebookCustomName("");
    } else {
      sessionStorage.setItem(notebookCustomNameKey(target), trimmed);
      if (target === sessionId) setNotebookCustomName(trimmed);
    }
    setRenamingSessionId(null);
    setRenameDraft("");
    setSessionList([...readSessionList()]);
  };

  const confirmDeleteSession = async (id: string) => {
    const label = getDisplayNameForSession(id);
    if (
      !window.confirm(
        `Delete "${label}"? Chat history and indexed documents for this notebook will be removed.`,
      )
    ) {
      return;
    }
    setOpenMenuSessionId(null);
    try {
      const res = await fetch(`${API_BASE}/sessions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 404) {
        console.error("Delete session failed", res.status);
      }
    } catch (e) {
      console.error(e);
    }
    clearSessionClientStorage(id);
    removeSessionFromList(id);
    const list = readSessionList();
    setSessionList(list);
    if (renamingSessionId === id) {
      setRenamingSessionId(null);
      setRenameDraft("");
    }

    if (sessionId !== id) return;

    if (list[0]) {
      sessionStorage.setItem(STORAGE_SESSION_KEY, list[0]);
      setSessionId(list[0]);
      setTurns(loadTurnsFromStorage(list[0]));
      setNotebookCustomName(
        sessionStorage.getItem(notebookCustomNameKey(list[0])) ?? "",
      );
    } else {
      await createNewNotebook();
    }
  };

  const handleRenameSubmit = (e: FormEvent) => {
    e.preventDefault();
    commitRename();
  };

  const handleRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  };

  return (
    <div className="app-shell">
      <div className="app-shell__brand-bar" aria-hidden="true" />
      <div className="app-layout">
        <aside className="app-sidebar" aria-label="Notebooks">
          <div className="app-sidebar__brand">Document Chat</div>
          <button
            type="button"
            className="app-sidebar__new"
            onClick={() => void createNewNotebook()}
          >
            + New notebook
          </button>
          <div className="app-sidebar__section-label">Sessions</div>
          <ul className="app-sidebar__list">
            {sessionList.map((id) => (
              <li key={id} className="app-sidebar__li">
                {renamingSessionId === id ? (
                  <form
                    className="app-sidebar__rename"
                    onSubmit={handleRenameSubmit}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label className="visually-hidden" htmlFor={renameInputId}>
                      Notebook name
                    </label>
                    <input
                      ref={renameInputRef}
                      id={renameInputId}
                      type="text"
                      className="app__workspace-input"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={handleRenameKeyDown}
                      maxLength={80}
                      autoComplete="off"
                    />
                    <div className="app__workspace-rename-actions">
                      <button type="submit" className="btn btn--primary btn--sm">
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={cancelRename}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div
                    className={
                      id === sessionId
                        ? "app-sidebar__row app-sidebar__row--active"
                        : "app-sidebar__row"
                    }
                  >
                    <button
                      type="button"
                      className="app-sidebar__row-main"
                      onClick={() => {
                        setOpenMenuSessionId(null);
                        void selectSession(id);
                      }}
                    >
                      <span className="app-sidebar__row-title">
                        {getDisplayNameForSession(id)}
                      </span>
                    </button>
                    <div
                      className="app-sidebar__row-menu"
                      data-session-menu-root=""
                    >
                      <button
                        type="button"
                        className="app-sidebar__menu-trigger"
                        aria-label={`Actions for ${getDisplayNameForSession(id)}`}
                        aria-expanded={openMenuSessionId === id}
                        aria-haspopup="menu"
                        onClick={(e) => openSessionMenu(e, id)}
                      >
                        <MoreVerticalIcon className="app-sidebar__menu-trigger-icon" />
                      </button>
                      {openMenuSessionId === id ? (
                        <ul className="app-sidebar__dropdown" role="menu">
                          <li role="none">
                            <button
                              type="button"
                              className="app-sidebar__dropdown-item"
                              role="menuitem"
                              onClick={() => startRenameForSession(id)}
                            >
                              Rename
                            </button>
                          </li>
                          <li role="none">
                            <button
                              type="button"
                              className="app-sidebar__dropdown-item app-sidebar__dropdown-item--danger"
                              role="menuitem"
                              onClick={() => void confirmDeleteSession(id)}
                            >
                              Delete
                            </button>
                          </li>
                        </ul>
                      ) : null}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </aside>

        <div className="app-main">
          <div
            className={
              mainDragActive
                ? "app-main__scroll app-main__scroll--drag"
                : "app-main__scroll"
            }
            tabIndex={-1}
            aria-label="Conversation"
            onDragOver={handleMainDragOver}
            onDragLeave={handleMainDragLeave}
            onDrop={handleMainDrop}
          >
            <div className="app-main__toolbar">
              {sessionId ? (
                <span className="app-main__crumb">{notebookTitle}</span>
              ) : null}
              {turns.length > 0 ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm app-main__clear"
                  onClick={clearChat}
                >
                  Clear chat
                </button>
              ) : null}
            </div>

            {turns.length === 0 ? (
              <p className="chat__empty">
                Upload a .txt file (plus below or drag here), then ask a
                question.
              </p>
            ) : null}

            {turns.map((turn) => (
              <article key={turn.id} className="chat__turn">
                <div className="msg msg--user">
                  <div className="msg__bubble msg__bubble--user">
                    {turn.query}
                  </div>
                </div>
                <div className="msg msg--assistant">
                  {turn.status === "pending" ? (
                    <div
                      className="msg__bubble msg__bubble--assistant msg__bubble--loading"
                      aria-busy="true"
                    >
                      <span className="msg__loading-dot" />
                      <span className="msg__loading-dot" />
                      <span className="msg__loading-dot" />
                    </div>
                  ) : null}
                  {turn.status === "error" ? (
                    <div className="msg__bubble msg__bubble--error">
                      {turn.message}
                    </div>
                  ) : null}
                  {turn.status === "done" ? (
                    <>
                      <div className="msg__bubble msg__bubble--assistant">
                        <p className="msg__answer">{turn.answer}</p>
                        <div className="msg__actions">
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => copyAnswer(turn.id, turn.answer)}
                          >
                            {copyId === turn.id ? "Copied" : "Copy answer"}
                          </button>
                        </div>
                      </div>
                      {turn.sources.length > 0 ? (
                        <details className="sources-details">
                          <summary className="sources-details__summary">
                            Sources ({turn.sources.length})
                          </summary>
                          <div className="sources-details__list">
                            {turn.sources.map((source, index) => (
                              <div className="source-card" key={index}>
                                <p className="source-card__meta">
                                  Doc {source.doc_id} · Chunk {source.chunk_id}
                                </p>
                                <p className="source-card__text">
                                  {source.text}
                                </p>
                                {source.distance !== undefined ? (
                                  <p className="source-card__score">
                                    Distance:{" "}
                                    {typeof source.distance === "number"
                                      ? source.distance.toFixed(4)
                                      : source.distance}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </article>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="app-composer">
            {uploadMessage ? (
              <p className="app-composer__status" role="status">
                {uploadLoading ? "Uploading… " : ""}
                {uploadMessage}
              </p>
            ) : null}
            <div className="app-composer__inner">
              <input
                ref={composerFileInputRef}
                id={composerFileInputId}
                type="file"
                className="visually-hidden"
                accept=".txt"
                onChange={handleComposerFileChange}
                disabled={uploadLoading || !sessionId}
              />
              <button
                type="button"
                className="app-composer__attach"
                aria-label="Upload a .txt document"
                title="Upload .txt"
                disabled={uploadLoading || !sessionId}
                onClick={() => composerFileInputRef.current?.click()}
              >
                <PlusIcon className="app-composer__attach-icon" />
              </button>
              <label className="visually-hidden" htmlFor="chat-input">
                Your question
              </label>
              <textarea
                id="chat-input"
                className="app-composer__input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder="Message…"
                rows={1}
                disabled={askLoading || !sessionId}
              />
              <button
                type="button"
                className="app-composer__send"
                onClick={handleAsk}
                disabled={askLoading || !query.trim() || !sessionId}
                aria-label="Send"
                title={
                  isMac ? "Send (Cmd+Enter)" : "Send (Ctrl+Enter)"
                }
              >
                {askLoading ? (
                  <span className="app-composer__send-loading" aria-hidden />
                ) : (
                  <SendIcon className="app-composer__send-icon" />
                )}
              </button>
            </div>
            <p className="app-composer__hint">
              {isMac ? "Cmd+Enter" : "Ctrl+Enter"} to send · .txt only
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
