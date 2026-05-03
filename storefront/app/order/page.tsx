"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OrderLookupPage() {
  const [number, setNumber] = useState("");
  const router = useRouter();
  return (
    <div className="max-w-md mx-auto py-12">
      <h1 className="text-2xl font-bold">Look up an order</h1>
      <p className="mt-2 text-neutral-600 text-sm">
        Enter your order number — we sent it after checkout.
      </p>
      <form
        onSubmit={(e) => { e.preventDefault(); if (number.trim()) router.push(`/order/${encodeURIComponent(number.trim())}`); }}
        className="mt-6 flex gap-2"
      >
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="ECOM-260503-0001"
          className="flex-1 px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:border-brand"
        />
        <button type="submit" className="px-4 py-2 rounded-md bg-brand text-white font-semibold">
          Look up
        </button>
      </form>
    </div>
  );
}
