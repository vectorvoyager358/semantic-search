export type Source = {
  text: string;
  doc_id: number;
  chunk_id: number;
  distance?: number;
};

export type ChatTurn =
  | { id: string; query: string; status: "pending" }
  | {
      id: string;
      query: string;
      status: "done";
      answer: string;
      sources: Source[];
    }
  | { id: string; query: string; status: "error"; message: string };

const NOTEBOOK_ADJECTIVES = [
  "Async",
  "Binary",
  "Neural",
  "Quantum",
  "Virtual",
  "Atomic",
  "Parallel",
  "Modular",
  "Nested",
  "Latent",
  "Static",
  "Prime",
  "Vector",
  "Zero",
  "Synthetic",
] as const;

const NOTEBOOK_NOUNS = [
  "Stack",
  "Socket",
  "Thread",
  "Cache",
  "Buffer",
  "Node",
  "Shard",
  "Queue",
  "Pipeline",
  "Tensor",
  "Replica",
  "Port",
  "Frame",
  "Cluster",
  "Daemon",
] as const;

export function notebookNameFromSessionId(id: string): string {
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

export const STORAGE_SESSION_KEY = "document-chat-rag-session-id";
export const SESSION_LIST_KEY = "document-chat-rag-session-list";
const SESSION_PINS_KEY = "document-chat-rag-session-pins";
export const MAX_SESSIONS_IN_LIST = 40;

export function turnsStorageKey(sessionId: string): string {
  return `document-chat-rag-turns:${sessionId}`;
}

export function notebookCustomNameKey(sessionId: string): string {
  return `document-chat-rag-notebook-custom:${sessionId}`;
}

export function readSessionList(): string[] {
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

export function writeSessionList(ids: string[]) {
  localStorage.setItem(
    SESSION_LIST_KEY,
    JSON.stringify(ids.slice(0, MAX_SESSIONS_IN_LIST)),
  );
}

export function readPinnedSessionIds(): string[] {
  try {
    const raw = localStorage.getItem(SESSION_PINS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writePinnedSessionIds(ids: string[]) {
  localStorage.setItem(SESSION_PINS_KEY, JSON.stringify(ids));
}

/** Pinned sessions render first (order = pin order), then the rest in list order. */
export function orderSessionsWithPins(sessionIds: string[]): string[] {
  const pins = readPinnedSessionIds();
  const inList = new Set(sessionIds);
  const pinnedOrdered = pins.filter((p) => inList.has(p));
  const pinnedSet = new Set(pinnedOrdered);
  const rest = sessionIds.filter((id) => !pinnedSet.has(id));
  return [...pinnedOrdered, ...rest];
}

export function isSessionPinned(id: string): boolean {
  return readPinnedSessionIds().includes(id);
}

export function toggleSessionPin(id: string): void {
  const pins = readPinnedSessionIds();
  if (pins.includes(id)) {
    writePinnedSessionIds(pins.filter((p) => p !== id));
  } else {
    writePinnedSessionIds([id, ...pins.filter((p) => p !== id)]);
  }
}

/** Reorder pinned notebooks among themselves; storage stays […pins, …unpinned]. */
export function reorderPinnedSessions(newPinnedOrder: string[]): boolean {
  const list = readSessionList();
  const inList = new Set(list);
  const currentPins = readPinnedSessionIds().filter((p) => inList.has(p));
  if (
    newPinnedOrder.length !== currentPins.length ||
    !newPinnedOrder.every((sid) => currentPins.includes(sid))
  ) {
    return false;
  }
  const pinSet = new Set(newPinnedOrder);
  const unpinned = list.filter((sid) => !pinSet.has(sid));
  writePinnedSessionIds(newPinnedOrder);
  writeSessionList([...newPinnedOrder, ...unpinned]);
  return true;
}

/** Reorder unpinned notebooks among themselves. */
export function reorderUnpinnedSessions(newUnpinnedOrder: string[]): boolean {
  const list = readSessionList();
  const inList = new Set(list);
  const pinOrder = readPinnedSessionIds().filter((p) => inList.has(p));
  const pinSet = new Set(pinOrder);
  const currentUnpinned = list.filter((sid) => !pinSet.has(sid));
  if (
    newUnpinnedOrder.length !== currentUnpinned.length ||
    !newUnpinnedOrder.every((sid) => currentUnpinned.includes(sid))
  ) {
    return false;
  }
  writeSessionList([...pinOrder, ...newUnpinnedOrder]);
  return true;
}

export function addSessionToList(id: string) {
  const withoutId = readSessionList().filter((x) => x !== id);
  const pinsRaw = readPinnedSessionIds();
  const idIsPinned = pinsRaw.includes(id);
  const pinOrder = idIsPinned
    ? pinsRaw.filter((p) => p === id || withoutId.includes(p))
    : pinsRaw.filter((p) => withoutId.includes(p));
  const pinSet = new Set(pinOrder);
  const unpinned = withoutId.filter((x) => !pinSet.has(x));
  const next = idIsPinned
    ? [...pinOrder, ...unpinned]
    : [...pinOrder, id, ...unpinned];
  writeSessionList(next);
}

export function removeSessionFromList(id: string) {
  writeSessionList(readSessionList().filter((x) => x !== id));
  writePinnedSessionIds(readPinnedSessionIds().filter((p) => p !== id));
}

export function clearSessionClientStorage(id: string): void {
  sessionStorage.removeItem(turnsStorageKey(id));
  sessionStorage.removeItem(notebookCustomNameKey(id));
}

export function getDisplayNameForSession(id: string): string {
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

export function loadTurnsFromStorage(sessionId: string): ChatTurn[] {
  try {
    const raw = sessionStorage.getItem(turnsStorageKey(sessionId));
    if (!raw) return [];
    return sanitizeTurns(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export type SessionBootstrap = { sessionId: string; turns: ChatTurn[] };

let sessionBootstrapPromise: Promise<SessionBootstrap> | null = null;

/** Clears the cached bootstrap promise (e.g. before a manual retry). */
export function resetSessionBootstrap(): void {
  sessionBootstrapPromise = null;
}

export function bootstrapSession(apiBase: string): Promise<SessionBootstrap> {
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
      const data = (await res.json()) as { session_id?: string };
      const id = data.session_id;
      if (typeof id !== "string") throw new Error("Invalid session response");
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
export async function reconcileSessionListWithServer(
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

/** Best-effort JSON for error responses that may not be JSON. */
export async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { _raw: text };
  }
}

export function errorDetailFromBody(data: Record<string, unknown>): string | undefined {
  const d = data.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0] && typeof d[0] === "object") {
    const first = d[0] as Record<string, unknown>;
    if (typeof first.msg === "string") return first.msg;
  }
  if (typeof data._raw === "string" && data._raw.length < 200) return data._raw;
  return undefined;
}

/** Map raw Error.message values to clearer copy for the chat UI. */
export function humanizeChatError(raw: string): { title: string; detail?: string } {
  const t = raw.trim();
  const lower = t.toLowerCase();

  if (
    lower === "failed to fetch" ||
    lower.includes("networkerror") ||
    lower === "load failed" ||
    lower.includes("network request failed")
  ) {
    return {
      title: "Couldn't reach the server",
      detail:
        "Check that the API is running and that the frontend is configured with the correct API URL.",
    };
  }

  if (lower === "aborterror" || lower.includes("aborted")) {
    return { title: "Request was cancelled", detail: t !== "AbortError" ? t : undefined };
  }

  if (lower.includes("invalid response")) {
    return { title: "Unexpected response from the server", detail: t };
  }

  return { title: t };
}
