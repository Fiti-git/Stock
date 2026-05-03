/**
 * Cart-token client helpers. Persisted in localStorage (client-only). The
 * token is opaque — created server-side by POST /api/ecom/cart/ on first
 * add-to-cart, then replayed on every subsequent call.
 *
 * We deliberately keep cart state OUT of cookies for now to avoid a
 * server-side cart fetch on every page render — the cart is a
 * client-only concept until the user hits /cart or checkout.
 */
const KEY = "ecom_cart_token_v1";

export function getCartToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setCartToken(token: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, token);
  } catch { /* ignore */ }
}

export function clearCartToken() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

const OUTLET_KEY = "ecom_outlet_id_v1";

export function getOutletId(): number {
  // Until a real outlet selector exists, fall back to env-provided default.
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(OUTLET_KEY);
    if (raw) return Number(raw) || 1;
  }
  return Number(process.env.NEXT_PUBLIC_DEFAULT_OUTLET_ID || 1);
}

export function setOutletId(id: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OUTLET_KEY, String(id));
  } catch { /* ignore */ }
}
