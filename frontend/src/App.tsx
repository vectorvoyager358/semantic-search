import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChatTurnBlock } from "./components/ChatTurnBlock";
import { ConfirmDialog } from "./components/ConfirmDialog";
import {
  DocumentIcon,
  GripVerticalIcon,
  MenuIcon,
  MoreVerticalIcon,
  PinIcon,
  PlusIcon,
  SendIcon,
} from "./components/icons";
import {
  addSessionToList,
  bootstrapSession,
  clearSessionClientStorage,
  errorDetailFromBody,
  getDisplayNameForSession,
  isSessionPinned,
  loadTurnsFromStorage,
  notebookCustomNameKey,
  orderSessionsWithPins,
  parseJsonSafe,
  readSessionList,
  reconcileSessionListWithServer,
  removeSessionFromList,
  reorderPinnedSessions,
  reorderUnpinnedSessions,
  resetSessionBootstrap,
  STORAGE_SESSION_KEY,
  toggleSessionPin,
  turnsStorageKey,
  type ChatTurn,
  type SessionBootstrap,
} from "./lib/session";
import "./App.css";

/** Min height to show Rename + Delete; flip menu up if less space below in the list. */
const SESSION_MENU_MIN_PX = 100;

type SessionDropdownState = {
  sessionId: string;
  rect: DOMRectReadOnly;
  openUp: boolean;
};

function sessionMenuFixedStyle(layout: {
  rect: DOMRectReadOnly;
  openUp: boolean;
}): CSSProperties {
  const { rect, openUp } = layout;
  if (typeof window === "undefined") {
    return { position: "fixed", zIndex: 999_999, minWidth: "9rem" };
  }
  const gap = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    position: "fixed",
    right: Math.max(8, vw - rect.right),
    zIndex: 999_999,
    minWidth: "9rem",
    margin: 0,
    ...(openUp
      ? {
          bottom: vh - rect.top + gap,
          top: "auto",
        }
      : {
          top: Math.max(8, rect.bottom + gap),
          bottom: "auto",
        }),
  };
}

function App() {
  const [sessionId, setSessionId] = useState<string>("");
  const [sessionList, setSessionList] = useState<string[]>([]);
  const [query, setQuery] = useState<string>("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [uploadLoading, setUploadLoading] = useState<boolean>(false);
  const [askLoading, setAskLoading] = useState<boolean>(false);
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [uploadStatusTone, setUploadStatusTone] = useState<
    "neutral" | "error" | "success"
  >("neutral");
  const [copyId, setCopyId] = useState<string | null>(null);
  const [mainDragActive, setMainDragActive] = useState<boolean>(false);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  );
  const [sessionDropdown, setSessionDropdown] =
    useState<SessionDropdownState | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>("");
  const [initPhase, setInitPhase] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [initError, setInitError] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 720px)").matches,
  );
  const [sessionDragId, setSessionDragId] = useState<string | null>(null);
  const [sessionDropTargetId, setSessionDropTargetId] = useState<string | null>(
    null,
  );
  const sessionDragRef = useRef<{
    id: string;
    kind: "pinned" | "unpinned";
  } | null>(null);

  const renameInputId = useId();
  const composerFileInputId = useId();
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const sidebarListRef = useRef<HTMLUListElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameBoxRef = useRef<HTMLDivElement>(null);
  const renameDraftRef = useRef(renameDraft);
  const composerFileInputRef = useRef<HTMLInputElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);

  renameDraftRef.current = renameDraft;

  const API_BASE =
    import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

  const closeSessionMenu = useCallback(() => {
    setSessionDropdown(null);
  }, []);

  const closeMobileSessions = useCallback(() => {
    setMobileSessionsOpen(false);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => {
      const narrow = mq.matches;
      setIsMobileLayout(narrow);
      if (!narrow) setMobileSessionsOpen(false);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!mobileSessionsOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setMobileSessionsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileSessionsOpen]);

  useEffect(() => {
    if (!mobileSessionsOpen || !isMobileLayout) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileSessionsOpen, isMobileLayout]);

  const applyBootstrapSuccess = useCallback(
    async (
      result: SessionBootstrap,
      options?: { isCancelled?: () => boolean },
    ) => {
      const aborted = () => options?.isCancelled?.() ?? false;
      if (aborted()) return;
      let sid = result.sessionId;
      let restored = result.turns;
      const latest = sessionStorage.getItem(STORAGE_SESSION_KEY);
      if (latest && latest !== sid) {
        sid = latest;
        restored = loadTurnsFromStorage(latest);
      }
      addSessionToList(sid);
      const validList = await reconcileSessionListWithServer(API_BASE, sid);
      if (aborted()) return;
      setSessionList(orderSessionsWithPins(validList));
      setSessionId(sid);
      setTurns(restored);
      setInitPhase("ready");
      setInitError("");
    },
    [API_BASE],
  );

  const createNewNotebook = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to create session");
      const data = (await res.json()) as { session_id?: string };
      const id = data.session_id;
      if (typeof id !== "string") throw new Error("Invalid session response");
      addSessionToList(id);
      sessionStorage.setItem(STORAGE_SESSION_KEY, id);
      const validList = await reconcileSessionListWithServer(API_BASE, id);
      setSessionList(orderSessionsWithPins(validList));
      setSessionId(id);
      setTurns([]);
      setRenamingSessionId(null);
      closeSessionMenu();
      setUploadMessage("");
      setUploadStatusTone("neutral");
      setInitPhase("ready");
      setInitError("");
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Error ? e.message : "Could not create a notebook.";
      setInitError(msg);
      setInitPhase("error");
    }
  }, [API_BASE, closeSessionMenu]);

  const selectSession = useCallback(
    async (id: string) => {
      if (id === sessionId) return;
      closeSessionMenu();
      const check = await fetch(`${API_BASE}/sessions/${id}`);
      if (!check.ok) {
        removeSessionFromList(id);
        setSessionList(orderSessionsWithPins(readSessionList()));
        return;
      }
      sessionStorage.setItem(STORAGE_SESSION_KEY, id);
      setSessionId(id);
      setTurns(loadTurnsFromStorage(id));
      setUploadMessage("");
      setUploadStatusTone("neutral");
    },
    [API_BASE, sessionId, closeSessionMenu],
  );

  useEffect(() => {
    let cancelled = false;
    bootstrapSession(API_BASE)
      .then((result) =>
        applyBootstrapSuccess(result, { isCancelled: () => cancelled }),
      )
      .catch((error: unknown) => {
        if (cancelled) return;
        const msg =
          error instanceof Error
            ? error.message
            : "Could not reach the API. Is the server running?";
        setInitError(msg);
        setInitPhase("error");
        console.error("Failed to init session:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [API_BASE, applyBootstrapSuccess]);

  useEffect(() => {
    if (renamingSessionId === null) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingSessionId]);

  useEffect(() => {
    if (sessionDropdown === null) return;
    const listEl = sidebarListRef.current;
    const onListScroll = () => closeSessionMenu();
    listEl?.addEventListener("scroll", onListScroll, { passive: true });
    return () => listEl?.removeEventListener("scroll", onListScroll);
  }, [sessionDropdown, closeSessionMenu]);

  useEffect(() => {
    if (sessionDropdown === null) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (!el.closest("[data-session-menu-root]")) closeSessionMenu();
    };
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeSessionMenu();
    };
    /* Defer so the same gesture that opened the menu doesn’t hit “outside” first. */
    const t = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDocPointerDown, true);
    }, 0);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [sessionDropdown, closeSessionMenu]);

  useEffect(() => {
    if (sessionDropdown === null) return;
    const onResize = () => closeSessionMenu();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sessionDropdown, closeSessionMenu]);

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

  const syncComposerHeight = useCallback(() => {
    const el = composerTextareaRef.current;
    if (!el) return;
    const styles = getComputedStyle(el);
    const min = parseFloat(styles.minHeight) || 36;
    const maxRaw = styles.maxHeight;
    const maxParsed = parseFloat(maxRaw);
    const max = Number.isFinite(maxParsed) ? maxParsed : 320;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, min), max);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    syncComposerHeight();
    const onResize = () => syncComposerHeight();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [query, syncComposerHeight]);

  const performUpload = async (f: File) => {
    if (!sessionId) return;
    if (!f.name.toLowerCase().endsWith(".txt")) {
      setUploadStatusTone("error");
      setUploadMessage("Only .txt files are supported.");
      return;
    }
    setUploadLoading(true);
    setUploadMessage("");
    setUploadStatusTone("neutral");
    try {
      const formData = new FormData();
      formData.append("file", f);
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/documents`, {
        method: "POST",
        body: formData,
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(
          errorDetailFromBody(data) ?? `Upload failed (${res.status})`,
        );
      }
      setUploadStatusTone("success");
      setUploadMessage(
        typeof data.message === "string" ? data.message : "Uploaded.",
      );
    } catch (error: unknown) {
      setUploadStatusTone("error");
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
    const related = e.relatedTarget;
    if (
      related instanceof Node &&
      mainScrollRef.current?.contains(related)
    ) {
      return;
    }
    setMainDragActive(false);
  };

  const handleMainDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMainDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) void performUpload(dropped);
  };

  const submitAsk = useCallback(
    async (q: string, existingTurnId?: string) => {
      if (!sessionId) return;

      const id = existingTurnId ?? crypto.randomUUID();
      if (existingTurnId) {
        setTurns((t) =>
          t.map((turn) =>
            turn.id === id ? { id, query: q, status: "pending" as const } : turn,
          ),
        );
      } else {
        setTurns((t) => [...t, { id, query: q, status: "pending" as const }]);
        setQuery("");
      }
      setAskLoading(true);

      try {
        const res = await fetch(`${API_BASE}/sessions/${sessionId}/ask`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: q }),
        });

        const data = await parseJsonSafe(res);

        if (!res.ok) {
          throw new Error(
            errorDetailFromBody(data) ?? `Question failed (${res.status})`,
          );
        }

        const answer = data.answer;
        const sources = data.sources;
        if (typeof answer !== "string") {
          throw new Error("Invalid response from server");
        }

        setTurns((t) =>
          t.map((turn) =>
            turn.id === id
              ? {
                  id,
                  query: q,
                  status: "done",
                  answer,
                  sources: Array.isArray(sources) ? sources : [],
                }
              : turn,
          ),
        );
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Something went wrong";
        setTurns((t) =>
          t.map((turn) =>
            turn.id === id
              ? { id, query: q, status: "error", message: msg }
              : turn,
          ),
        );
      } finally {
        setAskLoading(false);
      }
    },
    [sessionId, API_BASE],
  );

  const handleAsk = () => {
    if (!query.trim() || !sessionId) return;
    void submitAsk(query.trim());
  };

  const retryErrorTurn = useCallback(
    (turnId: string, q: string) => {
      void submitAsk(q, turnId);
    },
    [submitAsk],
  );

  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    if (e.shiftKey) return;
    e.preventDefault();
    if (!askLoading && query.trim()) void handleAsk();
  };

  const copyAnswer = useCallback(async (turnId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyId(turnId);
    } catch {
      setCopyId(null);
    }
  }, []);

  const openSessionMenu = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    setSessionDropdown((prev) => {
      if (prev?.sessionId === id) {
        return null;
      }
      const btn = e.currentTarget;
      const listEl = sidebarListRef.current;
      const vh =
        typeof window !== "undefined" ? window.innerHeight : SESSION_MENU_MIN_PX;
      if (btn instanceof HTMLElement && listEl) {
        const listRect = listEl.getBoundingClientRect();
        const rect = btn.getBoundingClientRect();
        const spaceBelowList = listRect.bottom - rect.bottom;
        const spaceBelowViewport = vh - rect.bottom;
        const spaceAboveViewport = rect.top;
        const tightBelow =
          spaceBelowList < SESSION_MENU_MIN_PX ||
          spaceBelowViewport < SESSION_MENU_MIN_PX;
        const openUp =
          tightBelow && spaceAboveViewport >= 40;
        return { sessionId: id, rect, openUp };
      }
      if (btn instanceof HTMLElement) {
        const rect = btn.getBoundingClientRect();
        const spaceBelowViewport = vh - rect.bottom;
        const openUp = spaceBelowViewport < SESSION_MENU_MIN_PX;
        return { sessionId: id, rect, openUp };
      }
      return null;
    });
  };

  const startRenameForSession = (id: string) => {
    closeSessionMenu();
    setRenamingSessionId(id);
    setRenameDraft(getDisplayNameForSession(id));
  };

  const cancelRename = () => {
    setRenamingSessionId(null);
    setRenameDraft("");
  };

  const applySessionRename = useCallback((sessionKey: string, draft: string) => {
    const trimmed = draft.trim();
    if (!trimmed) {
      sessionStorage.removeItem(notebookCustomNameKey(sessionKey));
    } else {
      sessionStorage.setItem(notebookCustomNameKey(sessionKey), trimmed);
    }
    setRenamingSessionId(null);
    setRenameDraft("");
    setSessionList(orderSessionsWithPins(readSessionList()));
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingSessionId) return;
    applySessionRename(renamingSessionId, renameDraft);
  }, [renamingSessionId, renameDraft, applySessionRename]);

  useEffect(() => {
    if (renamingSessionId === null) return;
    const id = renamingSessionId;
    const onPointerDown = (e: PointerEvent) => {
      const root = renameBoxRef.current;
      if (!root || root.contains(e.target as Node)) return;
      applySessionRename(id, renameDraftRef.current);
    };
    const t = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [renamingSessionId, applySessionRename]);

  const requestDeleteSession = (id: string) => {
    closeSessionMenu();
    setDeleteTarget({
      id,
      label: getDisplayNameForSession(id),
    });
  };

  const togglePinForSession = (id: string) => {
    closeSessionMenu();
    toggleSessionPin(id);
    setSessionList(orderSessionsWithPins(readSessionList()));
  };

  const endSessionDrag = useCallback(() => {
    sessionDragRef.current = null;
    setSessionDragId(null);
    setSessionDropTargetId(null);
  }, []);

  const moveSessionIdInSubgroup = (
    orderedIds: string[],
    draggedId: string,
    targetId: string,
  ): string[] | null => {
    const from = orderedIds.indexOf(draggedId);
    const to = orderedIds.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return null;
    const next = [...orderedIds];
    next.splice(from, 1);
    const insertAt = from < to ? to - 1 : to;
    next.splice(insertAt, 0, draggedId);
    return next;
  };

  const handleSessionDragHandleStart = (
    e: DragEvent<HTMLButtonElement>,
    id: string,
  ) => {
    e.stopPropagation();
    const kind = isSessionPinned(id) ? "pinned" : "unpinned";
    sessionDragRef.current = { id, kind };
    setSessionDragId(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.setData("text/x-session-reorder-kind", kind);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleSessionRowDragOver = (
    e: DragEvent<HTMLDivElement>,
    targetId: string,
  ) => {
    const drag = sessionDragRef.current;
    if (!drag || drag.id === targetId) return;
    const targetPinned = isSessionPinned(targetId);
    if (drag.kind === "pinned" && !targetPinned) return;
    if (drag.kind === "unpinned" && targetPinned) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setSessionDropTargetId(targetId);
  };

  const handleSessionRowDragLeave = (e: DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget;
    if (related instanceof Node && e.currentTarget.contains(related)) return;
    setSessionDropTargetId(null);
  };

  const handleSessionRowDrop = (
    e: DragEvent<HTMLDivElement>,
    targetId: string,
  ) => {
    e.preventDefault();
    const fromData = e.dataTransfer.getData("text/plain");
    const kindData = e.dataTransfer.getData("text/x-session-reorder-kind");
    const drag = sessionDragRef.current;
    const draggedId = fromData || drag?.id || "";
    const kind: "pinned" | "unpinned" | null =
      kindData === "pinned" || kindData === "unpinned"
        ? kindData
        : drag?.kind ?? null;
    try {
      if (
        !draggedId ||
        !kind ||
        draggedId === targetId ||
        (kind === "pinned") !== isSessionPinned(targetId)
      ) {
        return;
      }
      if (kind === "pinned") {
        const group = sessionList.filter((sid) => isSessionPinned(sid));
        const next = moveSessionIdInSubgroup(group, draggedId, targetId);
        if (next) reorderPinnedSessions(next);
      } else {
        const group = sessionList.filter((sid) => !isSessionPinned(sid));
        const next = moveSessionIdInSubgroup(group, draggedId, targetId);
        if (next) reorderUnpinnedSessions(next);
      }
      setSessionList(readSessionList());
    } finally {
      endSessionDrag();
    }
  };

  const runDeleteSession = useCallback(
    async (id: string) => {
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
      setSessionList(orderSessionsWithPins(list));
      if (renamingSessionId === id) {
        setRenamingSessionId(null);
        setRenameDraft("");
      }

      if (sessionId !== id) return;

      if (list[0]) {
        sessionStorage.setItem(STORAGE_SESSION_KEY, list[0]);
        setSessionId(list[0]);
        setTurns(loadTurnsFromStorage(list[0]));
      } else {
        await createNewNotebook();
      }
    },
    [API_BASE, sessionId, renamingSessionId, createNewNotebook],
  );

  const handleRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    }
  };

  const skipToMain = () => {
    mainScrollRef.current?.focus();
  };

  return (
    <div
      className={
        mobileSessionsOpen
          ? "app-shell app-shell--mobile-drawer-open"
          : "app-shell"
      }
    >
      <a
        href="#main-chat"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          skipToMain();
        }}
      >
        Skip to conversation
      </a>
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete notebook?"
        message={
          deleteTarget
            ? `“${deleteTarget.label}” and its chat history will be removed.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const id = deleteTarget.id;
          setDeleteTarget(null);
          await runDeleteSession(id);
        }}
      />
      <div className="app-layout">
        <button
          type="button"
          className="app-mobile-backdrop"
          aria-label="Close sessions menu"
          tabIndex={mobileSessionsOpen ? 0 : -1}
          onClick={closeMobileSessions}
        />
        <aside
          id="sessions-drawer"
          className="app-sidebar"
          aria-label="Notebooks"
          aria-hidden={
            isMobileLayout && !mobileSessionsOpen ? true : undefined
          }
          {...(isMobileLayout && !mobileSessionsOpen ? { inert: true } : {})}
        >
          <header className="app-sidebar__header">
            <div className="app-sidebar__brand">Document Chat</div>
            <p className="app-sidebar__tagline">
              RAG over your text files
            </p>
          </header>
          <button
            type="button"
            className="app-sidebar__new"
            onClick={() => {
              closeMobileSessions();
              void createNewNotebook();
            }}
            disabled={initPhase === "loading"}
          >
            <PlusIcon className="app-sidebar__new-icon" aria-hidden />
            New notebook
          </button>
          <div className="app-sidebar__section-label">Sessions</div>
          <ul className="app-sidebar__list" ref={sidebarListRef}>
            {sessionList.length === 0 && initPhase === "ready" ? (
              <li className="app-sidebar__empty">
                No notebooks yet. Create one to begin.
              </li>
            ) : null}
            {sessionList.map((id) => (
              <li key={id} className="app-sidebar__li">
                {renamingSessionId === id ? (
                  <div
                    ref={renameBoxRef}
                    className="app-sidebar__rename"
                  >
                    <label className="visually-hidden" htmlFor={renameInputId}>
                      Notebook name
                    </label>
                    <input
                      ref={renameInputRef}
                      id={renameInputId}
                      type="text"
                      className="app-sidebar__rename-input"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={handleRenameKeyDown}
                      maxLength={80}
                      autoComplete="off"
                    />
                  </div>
                ) : (
                  <div
                    className={[
                      "app-sidebar__row",
                      id === sessionId ? "app-sidebar__row--active" : "",
                      sessionDragId === id ? "app-sidebar__row--dragging" : "",
                      sessionDropTargetId === id
                        ? "app-sidebar__row--drop-target"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onDragOver={(e) => handleSessionRowDragOver(e, id)}
                    onDragLeave={handleSessionRowDragLeave}
                    onDrop={(e) => handleSessionRowDrop(e, id)}
                  >
                    <button
                      type="button"
                      className="app-sidebar__reorder-handle"
                      draggable
                      aria-label={`Reorder ${getDisplayNameForSession(id)}`}
                      title="Drag to reorder"
                      onDragStart={(e) => handleSessionDragHandleStart(e, id)}
                      onDragEnd={endSessionDrag}
                    >
                      <GripVerticalIcon className="app-sidebar__reorder-handle-icon" />
                    </button>
                    <button
                      type="button"
                      className="app-sidebar__row-main"
                      onClick={() => {
                        closeSessionMenu();
                        closeMobileSessions();
                        void selectSession(id);
                      }}
                    >
                      <span className="app-sidebar__row-main-inner">
                        {isSessionPinned(id) ? (
                          <PinIcon className="app-sidebar__pin-icon" />
                        ) : null}
                        <span className="app-sidebar__row-title">
                          {getDisplayNameForSession(id)}
                        </span>
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
                        aria-expanded={sessionDropdown?.sessionId === id}
                        aria-haspopup="menu"
                        onClick={(e) => openSessionMenu(e, id)}
                      >
                        <MoreVerticalIcon className="app-sidebar__menu-trigger-icon" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </aside>

        <main
          className="app-main"
          id="main-chat"
          tabIndex={-1}
          ref={mainScrollRef}
        >
          <div className="app-mobile-bar">
            <button
              type="button"
              className="app-mobile-bar__menu"
              aria-expanded={mobileSessionsOpen}
              aria-controls="sessions-drawer"
              onClick={() => setMobileSessionsOpen((open) => !open)}
            >
              <MenuIcon className="app-mobile-bar__menu-icon" />
              <span className="visually-hidden">Sessions and notebooks</span>
            </button>
          </div>
          <div
            className={
              mainDragActive
                ? "app-main__scroll app-main__scroll--drag"
                : "app-main__scroll"
            }
            aria-label="Conversation"
            onDragOver={handleMainDragOver}
            onDragLeave={handleMainDragLeave}
            onDrop={handleMainDrop}
          >
            <div className="app-main__content">
              {initPhase === "loading" ? (
                <div className="chat-state chat-state--loading" aria-busy="true">
                  <div className="chat-state__spinner" aria-hidden />
                  <p className="chat-state__title">Connecting to the API…</p>
                  <p className="chat-state__text">
                    Starting your workspace. If this hangs, check that the
                    backend is running at{" "}
                    <code className="inline-code">{API_BASE}</code>
                  </p>
                </div>
              ) : null}

              {initPhase === "error" ? (
                <div className="chat-state chat-state--error" role="alert">
                  <p className="chat-state__title">Could not start</p>
                  <p className="chat-state__text">{initError}</p>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm chat-state__action"
                                       onClick={() => {
                      setInitPhase("loading");
                      setInitError("");
                      resetSessionBootstrap();
                      void bootstrapSession(API_BASE)
                        .then((result) => applyBootstrapSuccess(result))
                        .catch((err: unknown) => {
                          const msg =
                            err instanceof Error
                              ? err.message
                              : "Could not reach the API.";
                          setInitError(msg);
                          setInitPhase("error");
                        });
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : null}

              {initPhase === "ready" && turns.length === 0 ? (
                <div className="chat-empty">
                  <div className="chat-empty__icon-wrap" aria-hidden>
                    <DocumentIcon className="chat-empty__icon" />
                  </div>
                  <h2 className="chat-empty__title">Start with a document</h2>
                  <p className="chat-empty__lead">
                    Upload a plain-text file, then ask questions grounded in
                    your content.
                  </p>
                  <ol className="chat-empty__steps">
                    <li>
                      Use <strong>+</strong> below or drag a <strong>.txt</strong>{" "}
                      file into this area.
                    </li>
                    <li>Wait for indexing to finish.</li>
                    <li>
                      Type a question and press{" "}
                      <kbd className="kbd">Enter</kbd> to send (
                      <kbd className="kbd">Shift</kbd>+<kbd className="kbd">
                        Enter
                      </kbd>{" "}
                      for a new line).
                    </li>
                  </ol>
                </div>
              ) : null}

              {initPhase === "ready"
                ? turns.map((turn) => (
                    <ChatTurnBlock
                      key={turn.id}
                      turn={turn}
                      copyId={copyId}
                      onCopyAnswer={copyAnswer}
                      onRetryErrorTurn={retryErrorTurn}
                      askLoading={askLoading}
                    />
                  ))
                : null}
              <div ref={chatEndRef} />
            </div>
          </div>

          <div className="app-composer">
            {uploadMessage ? (
              <p
                className={`app-composer__status app-composer__status--${uploadStatusTone}`}
                role={uploadStatusTone === "error" ? "alert" : "status"}
                aria-live={uploadStatusTone === "error" ? "assertive" : "polite"}
              >
                {uploadLoading ? "Uploading… " : ""}
                {uploadMessage}
              </p>
            ) : null}
            <div
              className={`app-composer__inner ${initPhase !== "ready" || !sessionId ? "app-composer__inner--disabled" : ""}`}
            >
              <input
                ref={composerFileInputRef}
                id={composerFileInputId}
                type="file"
                className="visually-hidden"
                accept=".txt,text/plain"
                onChange={handleComposerFileChange}
                disabled={uploadLoading || !sessionId || initPhase !== "ready"}
              />
              <button
                type="button"
                className="app-composer__attach"
                aria-label="Upload a .txt document"
                title="Upload .txt"
                disabled={
                  uploadLoading || !sessionId || initPhase !== "ready"
                }
                onClick={() => composerFileInputRef.current?.click()}
              >
                <PlusIcon className="app-composer__attach-icon" />
              </button>
              <label className="visually-hidden" htmlFor="chat-input">
                Your question
              </label>
              <textarea
                ref={composerTextareaRef}
                id="chat-input"
                className="app-composer__input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder={
                  initPhase !== "ready"
                    ? "Waiting for connection…"
                    : !sessionId
                      ? "Select a notebook…"
                      : "Ask about your documents…"
                }
                rows={1}
                disabled={
                  askLoading || !sessionId || initPhase !== "ready"
                }
              />
              <button
                type="button"
                className="app-composer__send"
                onClick={() => void handleAsk()}
                disabled={
                  askLoading ||
                  !query.trim() ||
                  !sessionId ||
                  initPhase !== "ready"
                }
                aria-label="Send"
                title="Send (Enter)"
              >
                {askLoading ? (
                  <span className="app-composer__send-loading" aria-hidden />
                ) : (
                  <SendIcon className="app-composer__send-icon" />
                )}
              </button>
            </div>
            <p className="app-composer__hint">
              Enter to send · Shift+Enter new line · Plain{" "}
              <span className="app-composer__hint-strong">.txt</span> only
            </p>
          </div>
        </main>
      </div>
      {sessionDropdown
        ? createPortal(
            <div data-session-menu-root="">
              <ul
                className="app-sidebar__dropdown app-sidebar__dropdown--portal"
                style={sessionMenuFixedStyle(sessionDropdown)}
                role="menu"
              >
                <li role="none">
                  <button
                    type="button"
                    className="app-sidebar__dropdown-item"
                    role="menuitem"
                    onClick={() =>
                      togglePinForSession(sessionDropdown.sessionId)
                    }
                  >
                    {isSessionPinned(sessionDropdown.sessionId)
                      ? "Unpin"
                      : "Pin"}
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    className="app-sidebar__dropdown-item"
                    role="menuitem"
                    onClick={() =>
                      startRenameForSession(sessionDropdown.sessionId)
                    }
                  >
                    Rename
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    className="app-sidebar__dropdown-item app-sidebar__dropdown-item--danger"
                    role="menuitem"
                    onClick={() =>
                      requestDeleteSession(sessionDropdown.sessionId)
                    }
                  >
                    Delete
                  </button>
                </li>
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default App;
