"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  cartRemoveItem, cartUpdateItem, fetchCart, type Cart,
} from "@/lib/api";
import { clearCartToken, getCartToken } from "@/lib/cart";

const fmt = (v: string | number) => Number(v).toLocaleString(undefined, {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export default function CartPage() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const load = async () => {
    setLoading(true); setError(null);
    const token = getCartToken();
    if (!token) { setCart(null); setLoading(false); return; }
    try {
      const c = await fetchCart(token);
      setCart(c);
    } catch (e: any) {
      // cart is gone or expired — wipe local token
      clearCartToken();
      setCart(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const update = async (itemId: number, qty: number) => {
    const token = getCartToken(); if (!token) return;
    try {
      const c = await cartUpdateItem(token, itemId, qty);
      setCart(c);
      window.dispatchEvent(new Event("cart:changed"));
    } catch (e: any) { setError(e?.message || "Update failed."); }
  };
  const remove = async (itemId: number) => {
    const token = getCartToken(); if (!token) return;
    try {
      const c = await cartRemoveItem(token, itemId);
      setCart(c);
      window.dispatchEvent(new Event("cart:changed"));
    } catch (e: any) { setError(e?.message || "Remove failed."); }
  };

  if (loading) return <div className="text-neutral-500">Loading…</div>;
  if (!cart || cart.items.length === 0) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-neutral-600">Add some products to get started.</p>
        <Link href="/" className="inline-block mt-6 px-6 py-2 rounded-md bg-brand text-white font-semibold">
          Browse catalog
        </Link>
      </div>
    );
  }

  const subtotal = Number(cart.subtotal || 0);

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-8">
      <div>
        <h1 className="text-2xl font-bold mb-6">Cart ({cart.item_count})</h1>
        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-red-700 text-sm">{error}</div>}
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
          {cart.items.map((line) => (
            <li key={line.id} className="py-4 flex gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{line.item_name}</div>
                <div className="text-xs text-neutral-500">SKU {line.item_code}</div>
                <div className="mt-2 inline-flex items-center border border-neutral-300 rounded-md">
                  <button onClick={() => update(line.item_id, Math.max(1, Number(line.qty) - 1))}
                    className="px-3 py-1 disabled:opacity-30">−</button>
                  <div className="w-10 text-center text-sm">{Number(line.qty)}</div>
                  <button onClick={() => update(line.item_id, Number(line.qty) + 1)}
                    className="px-3 py-1">+</button>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">LKR {fmt(line.line_total)}</div>
                <div className="text-xs text-neutral-500 mt-1">@ LKR {fmt(line.unit_price_snapshot)}</div>
                <button onClick={() => remove(line.item_id)}
                  className="mt-2 text-xs text-red-600 hover:underline">Remove</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start rounded-xl border border-neutral-200 p-6 bg-neutral-50">
        <h2 className="text-base font-bold mb-4">Order summary</h2>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-neutral-600">Subtotal</span>
          <span>LKR {fmt(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm mb-2 text-neutral-500">
          <span>Shipping</span>
          <span>Calculated at checkout</span>
        </div>
        <div className="flex justify-between text-sm mb-4 text-neutral-500">
          <span>Tax</span>
          <span>Calculated at checkout</span>
        </div>
        <div className="flex justify-between font-bold border-t border-neutral-300 pt-3 mb-6">
          <span>Total</span>
          <span>LKR {fmt(subtotal)}</span>
        </div>
        <button
          onClick={() => router.push("/checkout")}
          className="w-full px-4 py-3 rounded-md bg-brand text-white font-semibold hover:bg-brand-dark"
        >
          Checkout
        </button>
        <Link href="/" className="block mt-3 text-center text-sm text-neutral-500 hover:text-brand">
          Continue shopping
        </Link>
      </aside>
    </div>
  );
}
