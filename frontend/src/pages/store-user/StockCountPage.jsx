import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getCountItems, submitCount } from "../../api/dashboard";
import { useOutlet } from "../../contexts/OutletContext";

export default function StockCountPage() {
  const { outletId } = useOutlet();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // "all" | "uncounted" | "counted"
  const [saving, setSaving] = useState(null); // item_id currently being saved
  const [inputs, setInputs] = useState({}); // { [item_id]: { qty: "", location_tag: "" } }
  const [recount, setRecount] = useState({}); // { [item_id]: true }
  const [isMonthEnd, setIsMonthEnd] = useState(false);
  const inputRefs = useRef({});

  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

  useEffect(() => {
    setLoading(true);
    setItems([]);
    getCountItems(outletId)
      .then((res) => setItems(res.data))
      .catch(() => setError("Failed to load items. Make sure a POS upload exists for this outlet."))
      .finally(() => setLoading(false));
  }, [outletId]);

  function setInput(itemId, field, value) {
    setInputs((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { qty: "", location_tag: "" }), [field]: value },
    }));
  }

  const handleSave = useCallback(
    async (itemId) => {
      const input = inputs[itemId] || {};
      const qty = input.qty;
      if (qty === "" || qty === undefined || isNaN(Number(qty))) return;

      setSaving(itemId);
      try {
        const res = await submitCount(itemId, Number(qty), input.location_tag || "", isMonthEnd);
        const count = res.data;
        setItems((prev) =>
          prev.map((item) =>
            item.item_id === itemId
              ? {
                  ...item,
                  today_count_id: count.id,
                  today_actual_qty: Number(qty),
                  today_location_tag: input.location_tag || "",
                  today_counted_by: count.counted_by || null,
                }
              : item
          )
        );
        setInputs((prev) => { const n = { ...prev }; delete n[itemId]; return n; });
        setRecount((prev) => { const n = { ...prev }; delete n[itemId]; return n; });

        // Focus the next uncounted item
        const currentItems = items.map((it) =>
          it.item_id === itemId ? { ...it, today_actual_qty: Number(qty) } : it
        );
        const nextUncounted = currentItems.find(
          (it) => it.item_id !== itemId && it.today_actual_qty === null
        );
        if (nextUncounted && inputRefs.current[nextUncounted.item_id]) {
          setTimeout(() => inputRefs.current[nextUncounted.item_id]?.focus(), 50);
        }
      } catch {
        setError("Failed to save count. Please try again.");
        setTimeout(() => setError(null), 4000);
      } finally {
        setSaving(null);
      }
    },
    [inputs, items]
  );

  function startRecount(item) {
    setRecount((prev) => ({ ...prev, [item.item_id]: true }));
    setInputs((prev) => ({
      ...prev,
      [item.item_id]: {
        qty: item.today_actual_qty !== null ? String(item.today_actual_qty) : "",
        location_tag: item.today_location_tag || "",
      },
    }));
    setTimeout(() => inputRefs.current[item.item_id]?.focus(), 50);
  }

  function jumpToNextUncounted() {
    const next = items.find((it) => it.today_actual_qty === null && !recount[it.item_id]);
    if (next && inputRefs.current[next.item_id]) {
      inputRefs.current[next.item_id].scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => inputRefs.current[next.item_id]?.focus(), 150);
    }
  }

  const filtered = items
    .filter((item) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        item.item_code.toLowerCase().includes(q) ||
        item.item_name.toLowerCase().includes(q) ||
        (item.barcode || "").toLowerCase().includes(q)
      );
    })
    .filter((item) => {
      if (filter === "uncounted") return item.today_actual_qty === null;
      if (filter === "counted") return item.today_actual_qty !== null;
      return true;
    });

  const countedTotal = items.filter((i) => i.today_actual_qty !== null).length;
  const totalItems = items.length;
  const pct = totalItems > 0 ? Math.round((countedTotal / totalItems) * 100) : 0;
  const hasUncounted = items.some((i) => i.today_actual_qty === null);

  return (
    <Layout>
      <div className="max-w-3xl">
        {/* Sticky progress bar */}
        <div className="sticky top-0 z-10 bg-gray-50 pb-3 pt-1">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-xl font-semibold text-gray-900">Stock Count</h1>
            <span className="text-sm text-gray-500">{today}</span>
          </div>

          {totalItems > 0 && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{countedTotal} of {totalItems} items counted</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-600 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Month-end toggle */}
          <label className="flex items-center gap-2 mt-2 cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              checked={isMonthEnd}
              onChange={(e) => setIsMonthEnd(e.target.checked)}
              className="w-4 h-4 accent-brand-700"
            />
            <span className="text-xs text-gray-600 font-medium">
              Month-End Count
              {isMonthEnd && <span className="ml-1 text-brand-700">(active)</span>}
            </span>
          </label>
        </div>

        {error && (
          <div className="mb-4">
            <Alert type="error">{error}</Alert>
          </div>
        )}

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="text"
            placeholder="Search by code, name, or barcode…"
            className="flex-1 border rounded px-3 py-2.5 text-base sm:text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {/* Full-width tab filter on mobile */}
          <div className="grid grid-cols-3 sm:flex border rounded overflow-hidden text-sm">
            {["all", "uncounted", "counted"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`py-2.5 sm:py-2 px-3 capitalize text-center ${
                  filter === f ? "bg-brand-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading items…</p>
        ) : items.length === 0 ? (
          <Alert type="info">
            No items found. Upload a POS snapshot first before entering counts.
          </Alert>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 text-sm">No items match your search.</p>
        ) : (
          <div className="space-y-2 pb-20 sm:pb-4">
            {filtered.map((item) => {
              const isCounted = item.today_actual_qty !== null && !recount[item.item_id];
              const isSaving = saving === item.item_id;
              const input = inputs[item.item_id] || { qty: "", location_tag: "" };

              return (
                <div
                  key={item.item_id}
                  className={`bg-white border rounded-lg p-4 ${isCounted ? "border-green-200" : "border-gray-200"}`}
                >
                  {/* Item header — stacks on mobile */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 mb-2">
                    <div className="min-w-0">
                      <Link
                        to={`/items/${item.item_id}`}
                        className="font-medium text-gray-900 hover:underline text-sm"
                      >
                        {item.item_name}
                      </Link>
                      <div className="flex flex-wrap gap-2 mt-0.5 text-xs text-gray-500">
                        <span className="font-mono">{item.item_code}</span>
                        {item.category && <span>{item.category}</span>}
                        {item.barcode && <span>Barcode: {item.barcode}</span>}
                      </div>
                    </div>
                    <div className="flex sm:flex-col sm:text-right items-center sm:items-end gap-2 sm:gap-0 shrink-0">
                      <span className="text-xs text-gray-500">POS qty</span>
                      <div className="font-mono text-sm font-medium">{item.pos_qty}</div>
                    </div>
                  </div>

                  {isCounted ? (
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="text-green-700 font-medium">
                          Counted: {item.today_actual_qty}
                        </span>
                        {item.today_location_tag && (
                          <span className="text-gray-500 ml-2">@ {item.today_location_tag}</span>
                        )}
                        {item.today_counted_by && (
                          <span className="text-gray-400 ml-2 text-xs">by {item.today_counted_by}</span>
                        )}
                      </div>
                      <button
                        onClick={() => startRecount(item)}
                        className="text-xs text-brand-700 hover:underline"
                      >
                        Re-count
                      </button>
                    </div>
                  ) : (
                    /* Count inputs — stack vertically on mobile */
                    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Actual Qty *</label>
                        <input
                          ref={(el) => (inputRefs.current[item.item_id] = el)}
                          type="number"
                          inputMode="decimal"
                          step="0.001"
                          min="0"
                          className="w-full border rounded px-3 py-3 sm:py-2 text-base sm:text-sm"
                          placeholder="0.000"
                          value={input.qty}
                          onChange={(e) => setInput(item.item_id, "qty", e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSave(item.item_id)}
                          disabled={isSaving}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Location (optional)</label>
                        <input
                          type="text"
                          className="w-full border rounded px-3 py-3 sm:py-2 text-base sm:text-sm"
                          placeholder="e.g. Shelf A3"
                          value={input.location_tag}
                          onChange={(e) => setInput(item.item_id, "location_tag", e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSave(item.item_id)}
                          disabled={isSaving}
                        />
                      </div>
                      <button
                        onClick={() => handleSave(item.item_id)}
                        disabled={isSaving || input.qty === ""}
                        className="w-full sm:w-auto px-5 py-3 sm:py-2 bg-brand-700 text-white text-sm font-medium rounded hover:bg-brand-800 disabled:opacity-50 shrink-0"
                      >
                        {isSaving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating "Next uncounted" button — only on mobile, only when items remain */}
      {hasUncounted && !loading && (
        <button
          onClick={jumpToNextUncounted}
          className="sm:hidden fixed bottom-6 right-4 z-20 flex items-center gap-2 bg-brand-700 text-white text-sm font-medium px-4 py-3 rounded-full shadow-lg hover:bg-brand-800 active:scale-95 transition-transform"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          Next uncounted
        </button>
      )}
    </Layout>
  );
}
