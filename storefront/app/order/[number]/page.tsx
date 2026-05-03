"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getOrder, type Order } from "@/lib/api";

const fmt = (v: string | number) => Number(v).toLocaleString(undefined, {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const statusColor = (s: string) => ({
  pending_payment: "bg-amber-100 text-amber-800",
  paid: "bg-green-100 text-green-800",
  fulfilling: "bg-blue-100 text-blue-800",
  shipped: "bg-blue-100 text-blue-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-neutral-100 text-neutral-700",
  refunded: "bg-neutral-100 text-neutral-700",
}[s] || "bg-neutral-100 text-neutral-700");

export default function OrderPage({ params }: { params: { number: string } }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrder(params.number)
      .then(setOrder)
      .catch((e: any) => setError(e?.message || "Could not load order."));
  }, [params.number]);

  if (error) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <h1 className="text-2xl font-bold text-red-700">Order not found</h1>
        <p className="mt-2 text-neutral-600 text-sm">{error}</p>
        <Link href="/order" className="inline-block mt-6 px-4 py-2 rounded-md border border-neutral-300">
          Try again
        </Link>
      </div>
    );
  }

  if (!order) return <div className="text-neutral-500">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="rounded-xl bg-brand-light px-6 py-8">
        <div className="text-xs font-bold uppercase tracking-widest text-brand">Order received</div>
        <h1 className="text-2xl font-bold mt-1">Thank you, {order.shipping_address?.recipient_name || "customer"}.</h1>
        <p className="mt-2 text-sm text-neutral-700">
          Your order <span className="font-semibold">{order.number}</span> has been recorded.
          We'll be in touch shortly to confirm payment and arrange delivery.
        </p>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${statusColor(order.status)}`}>
          {order.status.replace(/_/g, " ")}
        </span>
        <span className="text-sm text-neutral-500">
          Placed {new Date(order.created_at).toLocaleString()}
        </span>
      </div>

      <div className="mt-8 rounded-xl border border-neutral-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2">Item</th>
              <th className="text-right px-4 py-2">Qty</th>
              <th className="text-right px-4 py-2">Unit</th>
              <th className="text-right px-4 py-2">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {order.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{l.item_name_snapshot}</div>
                  <div className="text-xs text-neutral-500">SKU {l.item_code_snapshot}</div>
                </td>
                <td className="text-right px-4 py-3">{Number(l.qty)}</td>
                <td className="text-right px-4 py-3">{fmt(l.unit_price)}</td>
                <td className="text-right px-4 py-3 font-semibold">{fmt(l.line_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-neutral-50">
            <tr><td className="px-4 py-2 text-right text-neutral-600" colSpan={3}>Subtotal</td>
              <td className="px-4 py-2 text-right">{fmt(order.subtotal)}</td></tr>
            <tr><td className="px-4 py-2 text-right text-neutral-600" colSpan={3}>Tax</td>
              <td className="px-4 py-2 text-right">{fmt(order.tax_total)}</td></tr>
            <tr><td className="px-4 py-2 text-right text-neutral-600" colSpan={3}>Shipping</td>
              <td className="px-4 py-2 text-right">{fmt(order.shipping_total)}</td></tr>
            <tr className="border-t border-neutral-300">
              <td className="px-4 py-3 text-right font-bold" colSpan={3}>Grand total</td>
              <td className="px-4 py-3 text-right font-bold">{order.currency} {fmt(order.grand_total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-8">
        <h2 className="text-base font-semibold mb-2">Shipping to</h2>
        <div className="text-sm text-neutral-700 whitespace-pre-line">
          {[
            order.shipping_address?.recipient_name,
            order.shipping_address?.line1, order.shipping_address?.line2,
            order.shipping_address?.city, order.shipping_address?.country,
            order.shipping_address?.phone,
          ].filter(Boolean).join("\n")}
        </div>
      </div>

      <Link href="/" className="inline-block mt-10 px-6 py-2 rounded-md border border-neutral-300 hover:bg-neutral-50">
        Back to catalog
      </Link>
    </div>
  );
}
