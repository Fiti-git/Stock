import React from "react";

/**
 * Renders inline warning chips for batches whose expiry is close.
 * Props:
 *   batches: [{ batch_no, expiry_date, qty, days_to_expiry }]
 *   threshold: int (default 7) — yellow if 0..threshold, red if < 0
 */
export default function BatchExpiryWarning({ batches, threshold = 7 }) {
  if (!batches || batches.length === 0) return null;
  const flagged = batches.filter(
    (b) => b.days_to_expiry !== null && b.days_to_expiry !== undefined && b.days_to_expiry <= threshold
  );
  if (flagged.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {flagged.map((b) => {
        const expired = b.days_to_expiry < 0;
        const cls = expired
          ? "bg-red-100 text-red-800 border-red-300"
          : "bg-yellow-100 text-yellow-800 border-yellow-300";
        const label = expired
          ? `EXPIRED: ${b.batch_no} (${Math.abs(b.days_to_expiry)}d ago)`
          : `${b.batch_no} expires in ${b.days_to_expiry}d`;
        return (
          <span
            key={b.batch_no + (b.expiry_date || "")}
            className={`text-xs px-2 py-0.5 rounded border ${cls}`}
            title={`Qty ${b.qty} · expires ${b.expiry_date || "?"}`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
