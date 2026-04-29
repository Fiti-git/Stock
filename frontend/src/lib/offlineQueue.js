// Raw IndexedDB wrapper for offline POS bill queue.
// We do not use the `idb` npm package (not installed in this project).

const DB_NAME = "pos_offline";
const DB_VERSION = 1;
const STORE = "pending_bills";

// Bill row shape:
// {
//   id (autoincrement),
//   payload,
//   idempotencyKey,
//   status: "queued" | "syncing" | "done" | "failed",
//   attempts,
//   lastError,
//   lastAttemptAt,
//   queuedAt,
//   syncedAt,
//   response,   // server response when done
// }

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("queuedAt", "queuedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(mode) {
  return openDb().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueBill(payload, idempotencyKey) {
  const store = await tx("readwrite");
  const row = {
    payload,
    idempotencyKey,
    status: "queued",
    attempts: 0,
    lastError: null,
    lastAttemptAt: null,
    queuedAt: Date.now(),
    syncedAt: null,
    response: null,
  };
  return reqToPromise(store.add(row));
}

export async function listPendingBills() {
  const store = await tx("readonly");
  const rows = await reqToPromise(store.getAll());
  // Sort FIFO by queuedAt
  rows.sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0));
  return rows;
}

async function getRow(id) {
  const store = await tx("readonly");
  return reqToPromise(store.get(id));
}

async function putRow(row) {
  const store = await tx("readwrite");
  return reqToPromise(store.put(row));
}

export async function markSyncing(id) {
  const row = await getRow(id);
  if (!row) return;
  row.status = "syncing";
  row.attempts = (row.attempts || 0) + 1;
  row.lastAttemptAt = Date.now();
  await putRow(row);
}

export async function markDone(id, response) {
  const row = await getRow(id);
  if (!row) return;
  row.status = "done";
  row.response = response || null;
  row.syncedAt = Date.now();
  row.lastError = null;
  await putRow(row);
}

export async function markFailed(id, error) {
  const row = await getRow(id);
  if (!row) return;
  row.status = "failed";
  row.lastError = typeof error === "string" ? error : (error?.message || JSON.stringify(error || {}));
  await putRow(row);
}

export async function markQueued(id, error) {
  // Used after a transient network failure during retry — leave for next tick.
  const row = await getRow(id);
  if (!row) return;
  row.status = "queued";
  row.lastError = error ? (typeof error === "string" ? error : (error?.message || "network error")) : null;
  await putRow(row);
}

export async function removeRow(id) {
  const store = await tx("readwrite");
  return reqToPromise(store.delete(id));
}

export async function removeDone(olderThanMs = 60 * 60 * 1000) {
  const cutoff = Date.now() - olderThanMs;
  const store = await tx("readwrite");
  const all = await reqToPromise(store.getAll());
  for (const row of all) {
    if (row.status === "done" && (row.syncedAt || 0) < cutoff) {
      store.delete(row.id);
    }
  }
}
