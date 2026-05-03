"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cartAddItem, createCart } from "@/lib/api";
import { getCartToken, getOutletId, setCartToken } from "@/lib/cart";

export default function AddToCartButton({ itemId }: { itemId: number }) {
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const router = useRouter();

  const onAdd = async () => {
    setBusy(true); setError(null); setAdded(false);
    try {
      let token = getCartToken();
      if (!token) {
        const cart = await createCart(getOutletId());
        token = cart.session_token;
        setCartToken(token);
      }
      await cartAddItem(token, itemId, qty);
      setAdded(true);
      window.dispatchEvent(new Event("cart:changed"));
    } catch (e: any) {
      setError(e?.message?.slice(0, 200) || "Could not add to cart.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center border border-neutral-300 rounded-md">
          <button
            type="button"
            className="px-3 py-2 text-lg disabled:opacity-30"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={busy}
          >−</button>
          <input
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="w-12 text-center outline-none"
            inputMode="numeric"
          />
          <button
            type="button"
            className="px-3 py-2 text-lg"
            onClick={() => setQty((q) => q + 1)}
            disabled={busy}
          >+</button>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={busy}
          className="px-6 py-2 rounded-md bg-brand text-white font-semibold hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add to cart"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/cart")}
          className="px-4 py-2 rounded-md border border-neutral-300 hover:bg-neutral-50 text-sm"
        >
          View cart
        </button>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {added && <div className="text-sm text-brand">Added — keep shopping or go to cart.</div>}
    </div>
  );
}
