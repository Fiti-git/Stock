/**
 * Client-side parser for EAN-13 type-2 weighed barcodes.
 * Mirrors backend/apps/items/barcode_parsing.py so the cart UI can
 * pre-fill qty without waiting for the network round-trip.
 *
 * Layout: "2 PPPPP WWWWW C" (1+5+5+1).
 */

function ean13Check(twelve) {
  let sOdd = 0, sEven = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(twelve[i]);
    if (i % 2 === 0) sOdd += d; else sEven += d;
  }
  return (10 - ((sOdd + 3 * sEven) % 10)) % 10;
}

/**
 * @returns {{plu: string, qty: number, raw: string} | null}
 *   plu — 5-digit string; qty — kilograms (or litres) as a Number with up
 *   to 3 decimals; raw — the original 13-digit string.
 */
export function parseEan13Type2(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.length !== 13) return null;
  if (!/^\d{13}$/.test(s)) return null;
  if (s[0] !== "2") return null;
  const plu = s.substring(1, 6);
  const weightRaw = s.substring(6, 11);
  const check = Number(s[12]);
  if (ean13Check(s.substring(0, 12)) !== check) return null;
  const qty = Number(weightRaw) / 1000;
  return { plu, qty, raw: s };
}
