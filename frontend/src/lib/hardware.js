/**
 * hardware.js — Local hardware agent abstraction for the POS terminal.
 *
 * The browser cannot speak raw TCP to a thermal printer or kick a cash-drawer
 * relay, so we assume a tiny "hardware bridge" agent runs on the till PC at
 * http://127.0.0.1:9100 and exposes a small HTTP API. ESC/POS byte generation
 * lives inside that agent — we just send rendered HTML and let it rasterize.
 *
 * Assumed agent contract:
 *   POST /print    body: { kind: "receipt", html: "<html>...", escpos?: "..." }
 *                  -> 200 { ok: true }
 *   POST /drawer   body: {}
 *                  -> 200 { ok: true }
 *   POST /display  body: { text: string, line?: 1 | 2 }
 *                  -> 200 { ok: true }
 *   GET  /health   -> 200 { ok: true, version: "x.y.z" }
 *
 * Design notes:
 * - All calls are time-bound (1500ms; 1000ms for /health). The agent is local —
 *   if it isn't snappy it's effectively unavailable.
 * - Nothing here ever throws to the caller. Hardware failure must never block
 *   a cashier from completing a sale.
 * - Print falls back to window.print() via a hidden iframe when the agent is
 *   unreachable AND fallbackToBrowserPrint is enabled (default true).
 * - Drawer / display silently no-op (warn-log only) when the agent is missing.
 */

import { renderReceiptHtml } from "./receiptTemplate";

const STORAGE_KEY = "pos.hardware.config";
const DEFAULT_AGENT_URL = "http://127.0.0.1:9100";
const REQUEST_TIMEOUT_MS = 1500;
const HEALTH_TIMEOUT_MS = 1000;

const DEFAULT_CONFIG = {
  agentUrl: DEFAULT_AGENT_URL,
  fallbackToBrowserPrint: true,
};

let _config = loadConfig();

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_config));
  } catch {
    /* localStorage unavailable — keep in-memory only */
  }
}

export function setHardwareConfig(patch = {}) {
  _config = { ..._config, ...patch };
  // Normalise agentUrl: strip trailing slash.
  if (typeof _config.agentUrl === "string") {
    _config.agentUrl = _config.agentUrl.trim().replace(/\/+$/, "");
    if (!_config.agentUrl) _config.agentUrl = DEFAULT_AGENT_URL;
  }
  saveConfig();
  return { ..._config };
}

export function getHardwareConfig() {
  return { ..._config };
}

async function agentFetch(path, { method = "GET", body, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const url = `${_config.agentUrl}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      // Don't send credentials — local agent is unauthenticated.
      credentials: "omit",
      mode: "cors",
    });
    if (!res.ok) {
      throw new Error(`agent ${path} -> HTTP ${res.status}`);
    }
    // Some endpoints may not return JSON; tolerate that.
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return await res.json();
    }
    return { ok: true };
  } finally {
    clearTimeout(timer);
  }
}

function browserPrintFallback(html) {
  // Render the receipt HTML inside a hidden iframe sized for 80mm paper, then
  // call the iframe's window.print(). This keeps focus in the POS window and
  // doesn't trigger pop-up blockers like window.open() does.
  try {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    Object.assign(iframe.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "80mm",
      height: "0",
      border: "0",
      visibility: "hidden",
    });
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return false;
    }
    doc.open();
    doc.write(html);
    doc.close();
    // Give the browser a tick to lay out before printing.
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.warn("hardware: browser print failed", e);
      }
      // Remove iframe after a short delay so the print dialog has the doc.
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch { /* ignore */ }
      }, 1000);
    }, 50);
    return true;
  } catch (e) {
    console.warn("hardware: browser print fallback failed", e);
    return false;
  }
}

export async function printReceipt(bill, options = {}) {
  let html = "";
  try {
    html = renderReceiptHtml(bill);
  } catch (e) {
    console.warn("hardware: failed to render receipt", e);
    return false;
  }
  if (!html) return false;

  try {
    await agentFetch("/print", {
      method: "POST",
      body: { kind: "receipt", html, ...(options.escpos ? { escpos: options.escpos } : {}) },
    });
    return true;
  } catch (err) {
    console.warn("hardware: agent print failed, attempting fallback", err?.message || err);
    if (_config.fallbackToBrowserPrint) {
      return browserPrintFallback(html);
    }
    return false;
  }
}

export async function openCashDrawer() {
  try {
    await agentFetch("/drawer", { method: "POST", body: {} });
    return true;
  } catch (err) {
    console.warn("hardware: openCashDrawer failed", err?.message || err);
    return false;
  }
}

export async function displayMessage(text, options = {}) {
  try {
    await agentFetch("/display", {
      method: "POST",
      body: { text: String(text ?? ""), ...(options.line ? { line: options.line } : {}) },
    });
    return true;
  } catch (err) {
    console.warn("hardware: displayMessage failed", err?.message || err);
    return false;
  }
}

export async function probeAgent() {
  try {
    const res = await agentFetch("/health", { method: "GET", timeoutMs: HEALTH_TIMEOUT_MS });
    return { available: true, version: res?.version };
  } catch {
    return { available: false };
  }
}
