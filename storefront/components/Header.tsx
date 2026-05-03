"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchCart } from "@/lib/api";
import { getCartToken } from "@/lib/cart";

export default function Header() {
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    const token = getCartToken();
    if (!token) return;
    fetchCart(token).then((c) => setCartCount(c.item_count || 0)).catch(() => {});
    const onStorage = () => {
      const t = getCartToken();
      if (!t) { setCartCount(0); return; }
      fetchCart(t).then((c) => setCartCount(c.item_count || 0)).catch(() => {});
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("cart:changed", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("cart:changed", onStorage);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-neutral-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-brand text-white grid place-items-center font-bold">A</div>
          <div className="hidden sm:block leading-tight">
            <div className="text-sm font-bold">Arunalu Super Mart</div>
            <div className="text-xs text-neutral-500">Online Store</div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/" className="hover:text-brand">Shop</Link>
          <Link href="/category" className="hover:text-brand">Categories</Link>
          <Link href="/order" className="hover:text-brand">My Order</Link>
        </nav>

        <Link
          href="/cart"
          className="relative inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white text-sm font-semibold hover:bg-brand-dark"
        >
          Cart
          {cartCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-brand text-xs font-bold">
              {cartCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
