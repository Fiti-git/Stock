"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkout, fetchCart, type Cart } from "@/lib/api";
import { clearCartToken, getCartToken } from "@/lib/cart";

const fmt = (v: string | number) => Number(v).toLocaleString(undefined, {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    guest_name: "", guest_email: "", guest_phone: "",
    line1: "", line2: "", city: "", postal_code: "", country: "LK",
  });

  useEffect(() => {
    const token = getCartToken();
    if (!token) { router.replace("/cart"); return; }
    fetchCart(token).then(setCart).catch(() => router.replace("/cart")).finally(() => setLoading(false));
  }, [router]);

  const submit = async () => {
    if (!cart) return;
    setBusy(true); setError(null);
    try {
      const order = await checkout(cart.session_token, {
        shipping_address: {
          recipient_name: form.guest_name || "Guest",
          phone: form.guest_phone,
          line1: form.line1, line2: form.line2,
          city: form.city, postal_code: form.postal_code,
          country: form.country,
        },
        guest_name: form.guest_name,
        guest_email: form.guest_email,
        guest_phone: form.guest_phone,
        shipping_total: "0",
        tax_rate: "0",
      });
      clearCartToken();
      window.dispatchEvent(new Event("cart:changed"));
      router.push(`/order/${order.number}`);
    } catch (e: any) {
      setError(e?.message?.slice(0, 240) || "Checkout failed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="text-neutral-500">Loading…</div>;
  if (!cart) return null;

  const subtotal = Number(cart.subtotal || 0);
  const valid = form.guest_name && form.guest_phone && form.line1 && form.city;

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-8">
      <div>
        <h1 className="text-2xl font-bold mb-6">Checkout</h1>
        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</div>}

        <h2 className="text-base font-semibold mb-3">Contact</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Full name *" value={form.guest_name} onChange={(v) => setForm((f) => ({ ...f, guest_name: v }))} />
          <Input label="Phone *" value={form.guest_phone} onChange={(v) => setForm((f) => ({ ...f, guest_phone: v }))} />
          <Input label="Email" value={form.guest_email} onChange={(v) => setForm((f) => ({ ...f, guest_email: v }))} type="email" />
        </div>

        <h2 className="text-base font-semibold mb-3 mt-8">Shipping address</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Address line 1 *" value={form.line1} onChange={(v) => setForm((f) => ({ ...f, line1: v }))} />
          <Input label="Address line 2" value={form.line2} onChange={(v) => setForm((f) => ({ ...f, line2: v }))} />
          <Input label="City *" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
          <Input label="Postal code" value={form.postal_code} onChange={(v) => setForm((f) => ({ ...f, postal_code: v }))} />
          <Input label="Country" value={form.country} onChange={(v) => setForm((f) => ({ ...f, country: v }))} />
        </div>

        <div className="mt-8 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Payment gateway integration is coming soon. For now, your order will be created in
          <span className="font-semibold"> pending payment</span> status — an operator will confirm
          and arrange manual payment + delivery.
        </div>

        <button
          onClick={submit}
          disabled={busy || !valid}
          className="mt-6 w-full sm:w-auto px-8 py-3 rounded-md bg-brand text-white font-semibold disabled:opacity-50 hover:bg-brand-dark"
        >
          {busy ? "Placing order…" : "Place order"}
        </button>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start rounded-xl border border-neutral-200 p-6 bg-neutral-50">
        <h2 className="text-base font-bold mb-4">Your order</h2>
        <ul className="divide-y divide-neutral-200 mb-4 text-sm">
          {cart.items.map((l) => (
            <li key={l.id} className="py-2 flex justify-between gap-2">
              <span className="truncate">{l.item_name} × {Number(l.qty)}</span>
              <span className="shrink-0">LKR {fmt(l.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between font-bold border-t border-neutral-300 pt-3">
          <span>Total</span>
          <span>LKR {fmt(subtotal)}</span>
        </div>
      </aside>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-neutral-600 mb-1">{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:border-brand" />
    </label>
  );
}
