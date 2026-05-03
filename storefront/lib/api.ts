/**
 * Backend API client. Two base URLs:
 *
 *   - apiBaseClient (browser)   = NEXT_PUBLIC_API_BASE,
 *                                 e.g. http://shop.local:1606/api or
 *                                      https://api.example.com/api
 *   - apiBaseServer (SSR/RSC)   = API_INTERNAL_BASE if set (docker DNS,
 *                                 e.g. http://backend:8000/api), else
 *                                 falls back to apiBaseClient.
 *
 * Server components fetch with `cache: "no-store"` for now — we don't
 * have ISR keying on slugs yet. Phase 5 can add revalidation tags.
 */

function getServerBase(): string {
  return process.env.API_INTERNAL_BASE
    || process.env.NEXT_PUBLIC_API_BASE
    || "http://localhost:8001/api";
}

function getClientBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE || "/api";
}

export const apiBaseServer = (typeof window === "undefined") ? getServerBase() : getClientBase();
export const apiBaseClient = getClientBase();

/** Issue a request from a server component (no cache, full base url). */
export async function apiServer<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${getServerBase()}${path}`;
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`apiServer ${url} -> ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Issue a request from the browser (uses cookies + relative path). */
export async function apiClient<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${getClientBase()}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`apiClient ${url} -> ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ---------------------- Storefront read API (Phase 1) ----------------------
export type ProductCard = {
  id: number;
  item_code: string;
  item_name: string;
  category: string;
  slug: string;
  cover_image: { url: string; alt_text: string } | null;
  price: string | null;
};

export type ProductDetail = ProductCard & {
  short_description: string;
  long_description: string;
  seo_title: string;
  seo_description: string;
  images: { id: number; url: string; alt_text: string; sort_order: number }[];
  compare_at_price: string | null;
  currency: string;
  barcode: string | null;
};

export const listProducts = (params: {
  page?: number; page_size?: number; category?: string; q?: string;
} = {}) => {
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.page_size) sp.set("page_size", String(params.page_size));
  if (params.category) sp.set("category", params.category);
  if (params.q) sp.set("q", params.q);
  const qs = sp.toString();
  return apiServer<{ count: number; results: ProductCard[]; total_pages: number; page: number; page_size: number }>(
    `/storefront/products/${qs ? `?${qs}` : ""}`
  );
};

export const getProduct = (slug: string) =>
  apiServer<ProductDetail>(`/storefront/products/${encodeURIComponent(slug)}/`);

export const listCategories = () =>
  apiServer<{ results: { name: string }[] }>(`/storefront/categories/`);

// ---------------------- Ecom cart / checkout (Phase 2) ----------------------
export type Cart = {
  id: number;
  session_token: string;
  outlet_id: number;
  customer_id: number | null;
  status: string;
  items: {
    id: number;
    item_id: number;
    item_code: string;
    item_name: string;
    qty: string;
    unit_price_snapshot: string;
    line_total: string;
  }[];
  subtotal: string;
  item_count: number;
};

export type Order = {
  id: number;
  number: string;
  status: string;
  subtotal: string;
  tax_total: string;
  shipping_total: string;
  grand_total: string;
  currency: string;
  shipping_address: any;
  lines: {
    id: number;
    item_code_snapshot: string;
    item_name_snapshot: string;
    qty: string;
    unit_price: string;
    line_total: string;
  }[];
  paid_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export const createCart = (outletId: number, sessionToken?: string) =>
  apiClient<Cart>(`/ecom/cart/`, {
    method: "POST",
    body: JSON.stringify({ outlet_id: outletId, session_token: sessionToken || undefined }),
  });

export const fetchCart = (token: string) =>
  apiClient<Cart>(`/ecom/cart/${token}/`);

export const cartAddItem = (token: string, itemId: number, qty: number) =>
  apiClient<Cart>(`/ecom/cart/${token}/items/`, {
    method: "POST",
    body: JSON.stringify({ item_id: itemId, qty }),
  });

export const cartUpdateItem = (token: string, itemId: number, qty: number) =>
  apiClient<Cart>(`/ecom/cart/${token}/items/${itemId}/`, {
    method: "PATCH",
    body: JSON.stringify({ qty }),
  });

export const cartRemoveItem = (token: string, itemId: number) =>
  apiClient<Cart>(`/ecom/cart/${token}/items/${itemId}/remove/`, {
    method: "DELETE",
  });

export const checkout = (token: string, payload: {
  shipping_address: any;
  guest_name?: string; guest_email?: string; guest_phone?: string;
  shipping_total?: string; tax_rate?: string;
}) =>
  apiClient<Order>(`/ecom/cart/${token}/checkout/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getOrder = (number: string) =>
  apiClient<Order>(`/ecom/orders/${number}/`);
