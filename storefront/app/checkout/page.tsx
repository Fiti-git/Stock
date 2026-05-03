"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkout, fetchCart, initiatePayHere, type Cart } from "@/lib/api";
import { clearCartToken, getCartToken } from "@/lib/cart";

const fmt = (v: string | number) => Number(v).toLocaleString(undefined, {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

type Outlet = { id: number; outlet_name: string; address: string; phone: string };

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fulfilment + payment selection
  const [fulfilment, setFulfilment] = useState<"delivery" | "pickup">("delivery");
  const [pickupOutletId, setPickupOutletId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"payhere" | "store_cash">("payhere");

  // Customer / address form
  const [form, setForm] = useState({
    guest_name: "", guest_email: "", guest_phone: "",
    line1: "", line2: "", city: "", postal_code: "", country: "LK",
  });

  useEffect(() => {
    const token = getCartToken();
    if (!token) { router.replace("/cart"); return; }
    Promise.all([
      fetchCart(token).then(setCart),
      fetch(`${process.env.NEXT_PUBLIC_API_BASE || "/api"}/storefront/outlets/`)
        .then((r) => r.ok ? r.json() : { results: [] })
        .then((d) => setOutlets(d.results || [])),
    ])
      .catch(() => router.replace("/cart"))
      .finally(() => setLoading(false));
  }, [router]);

  // When pickup is chosen, default outlet to the cart's outlet OR the first one.
  useEffect(() => {
    if (fulfilment === "pickup" && pickupOutletId == null) {
      setPickupOutletId(cart?.outlet_id ?? outlets[0]?.id ?? null);
    }
  }, [fulfilment, cart, outlets, pickupOutletId]);

  // Pickup payment must always be store-side (we have no online charge if
  // you're walking in to collect). Reset payment when fulfilment changes.
  useEffect(() => {
    if (fulfilment === "pickup") setPaymentMethod("store_cash");
    else setPaymentMethod("payhere");
  }, [fulfilment]);

  const submit = async () => {
    if (!cart) return;
    setBusy(true); setError(null);
    try {
      const order = await checkout(cart.session_token, {
        shipping_address: fulfilment === "delivery" ? {
          recipient_name: form.guest_name || "Guest",
          phone: form.guest_phone,
          line1: form.line1, line2: form.line2,
          city: form.city, postal_code: form.postal_code,
          country: form.country,
        } : {
          recipient_name: form.guest_name || "Guest",
          phone: form.guest_phone,
          line1: "Pickup at outlet", city: "—", country: form.country,
        },
        guest_name: form.guest_name,
        guest_email: form.guest_email,
        guest_phone: form.guest_phone,
        shipping_total: "0",
        tax_rate: "0",
        fulfilment_method: fulfilment,
        pickup_outlet_id: fulfilment === "pickup" ? pickupOutletId : null,
        payment_method: paymentMethod,
      });

      clearCartToken();
      window.dispatchEvent(new Event("cart:changed"));

      if (paymentMethod === "payhere") {
        // Pull PayHere fields and auto-POST. Storefront stays in the
        // current tab; PayHere will redirect back to PAYHERE_RETURN_URL.
        try {
          const init = await initiatePayHere(order.number);
          autoSubmit(init.checkout_url, init.fields);
          return; // don't navigate — PayHere will take over the page
        } catch (e: any) {
          setError(`Order created, but PayHere init failed: ${e?.message || "unknown"}. Order number ${order.number}.`);
        }
      }

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
  const valid = form.guest_name && form.guest_phone
    && (fulfilment === "pickup" ? pickupOutletId != null
        : (form.line1 && form.city));

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-8">
      <div>
        <h1 className="text-2xl font-bold mb-6">Checkout</h1>
        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</div>}

        {/* Fulfilment selector */}
        <h2 className="text-base font-semibold mb-3">How would you like to receive your order?</h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-6">
          <RadioCard
            checked={fulfilment === "delivery"}
            onClick={() => setFulfilment("delivery")}
            title="Home delivery"
            subtitle="We'll ship the order to your address. Pay online via PayHere."
          />
          <RadioCard
            checked={fulfilment === "pickup"}
            onClick={() => setFulfilment("pickup")}
            title="Store pickup"
            subtitle="Collect from one of our outlets. Pay in store on collection."
          />
        </div>

        {fulfilment === "pickup" && (
          <>
            <h3 className="text-sm font-semibold mb-2">Pickup location</h3>
            <div className="space-y-2 mb-6">
              {outlets.length === 0 ? (
                <div className="text-sm text-neutral-500">No outlets available right now.</div>
              ) : outlets.map((o) => (
                <RadioCard
                  key={o.id}
                  checked={pickupOutletId === o.id}
                  onClick={() => setPickupOutletId(o.id)}
                  title={o.outlet_name}
                  subtitle={[o.address, o.phone].filter(Boolean).join(" · ") || "Outlet"}
                  small
                />
              ))}
            </div>
          </>
        )}

        <h2 className="text-base font-semibold mb-3">Contact</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Full name *" value={form.guest_name} onChange={(v) => setForm((f) => ({ ...f, guest_name: v }))} />
          <Input label="Phone *" value={form.guest_phone} onChange={(v) => setForm((f) => ({ ...f, guest_phone: v }))} />
          <Input label="Email" value={form.guest_email} onChange={(v) => setForm((f) => ({ ...f, guest_email: v }))} type="email" />
        </div>

        {fulfilment === "delivery" && (
          <>
            <h2 className="text-base font-semibold mb-3 mt-8">Shipping address</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input label="Address line 1 *" value={form.line1} onChange={(v) => setForm((f) => ({ ...f, line1: v }))} />
              <Input label="Address line 2" value={form.line2} onChange={(v) => setForm((f) => ({ ...f, line2: v }))} />
              <Input label="City *" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
              <Input label="Postal code" value={form.postal_code} onChange={(v) => setForm((f) => ({ ...f, postal_code: v }))} />
              <Input label="Country" value={form.country} onChange={(v) => setForm((f) => ({ ...f, country: v }))} />
            </div>
          </>
        )}

        {/* Payment selector — only really meaningful for delivery (pickup is always store_cash) */}
        {fulfilment === "delivery" && (
          <>
            <h2 className="text-base font-semibold mb-3 mt-8">Payment</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <RadioCard
                checked={paymentMethod === "payhere"}
                onClick={() => setPaymentMethod("payhere")}
                title="Pay online via PayHere"
                subtitle="Card / online banking. You'll be redirected to PayHere."
              />
              <RadioCard
                checked={paymentMethod === "store_cash"}
                onClick={() => setPaymentMethod("store_cash")}
                title="Cash on delivery"
                subtitle="Pay our courier when the order arrives."
              />
            </div>
          </>
        )}

        <button
          onClick={submit}
          disabled={busy || !valid}
          className="mt-8 w-full sm:w-auto px-8 py-3 rounded-md bg-brand text-white font-semibold disabled:opacity-50 hover:bg-brand-dark"
        >
          {busy ? "Placing order…" :
            paymentMethod === "payhere" ? "Continue to PayHere" : "Place order"}
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

function autoSubmit(action: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  for (const [k, v] of Object.entries(fields)) {
    const inp = document.createElement("input");
    inp.type = "hidden";
    inp.name = k;
    inp.value = v ?? "";
    form.appendChild(inp);
  }
  document.body.appendChild(form);
  form.submit();
}

function RadioCard({
  checked, onClick, title, subtitle, small,
}: {
  checked: boolean; onClick: () => void; title: string; subtitle?: string; small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border ${checked ? "border-brand bg-brand-light" : "border-neutral-200 bg-white"} ${small ? "px-3 py-2" : "px-4 py-3"} hover:border-brand transition`}
    >
      <div className={`flex items-start gap-3`}>
        <span className={`mt-1 inline-block w-4 h-4 rounded-full border ${checked ? "border-brand bg-brand" : "border-neutral-400 bg-white"}`} />
        <span className="flex-1">
          <span className={`block font-semibold ${small ? "text-sm" : ""}`}>{title}</span>
          {subtitle && <span className={`block text-neutral-600 ${small ? "text-xs" : "text-sm"} mt-0.5`}>{subtitle}</span>}
        </span>
      </div>
    </button>
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
