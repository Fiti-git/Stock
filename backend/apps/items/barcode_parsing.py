"""
EAN-13 type-2 weighed-barcode parser.

Layout: ``2 PPPPP WWWWW C`` (1 + 5 + 5 + 1 = 13 digits)
  * leading ``2`` flags an in-store ("type-2") barcode,
  * PPPPP — five-digit item PLU (matches Item.weighed_barcode_prefix),
  * WWWWW — embedded payload (this system uses WEIGHT, fixed 3-decimal,
    so 01234 = 1.234 kg). Most Sri Lankan retailers print weight, not price.
  * C — mod-10 check digit. We optionally verify it.
"""
from decimal import Decimal


def _ean13_check_digit(twelve: str) -> int:
    s_odd = sum(int(twelve[i]) for i in range(0, 12, 2))
    s_even = sum(int(twelve[i]) for i in range(1, 12, 2))
    total = s_odd + 3 * s_even
    return (10 - (total % 10)) % 10


def parse_ean13_type2(barcode):
    """
    Parse an EAN-13 type-2 weighed barcode.

    Returns ``{"plu": "PPPPP", "qty": Decimal("W.WWW"), "raw": barcode}``
    on a valid match, or ``None`` if the input is the wrong length / not
    type-2 / has a bad check digit.
    """
    if not barcode:
        return None
    s = str(barcode).strip()
    if len(s) != 13 or not s.isdigit():
        return None
    if s[0] != "2":
        return None
    plu = s[1:6]
    weight_raw = s[6:11]
    check = int(s[12])
    if _ean13_check_digit(s[:12]) != check:
        return None
    # Weight is 3-decimal fixed: 01234 → 1.234.
    qty = (Decimal(weight_raw) / Decimal("1000")).quantize(Decimal("0.001"))
    return {"plu": plu, "qty": qty, "raw": s}


def parse_barcode(code):
    """
    Canonical barcode classifier used by the POS scan path.

    Convention (common SL/EU weight-embedded layout):
      - positions 0-1  = "2x" prefix (leading "2" flags type-2 in-store)
      - positions 2-6  = 5-digit PLU
      - positions 7-11 = 5-digit weight in grams (so /1000 = kg)
      - position  12   = check digit (we trust it; verification done by
                         the helper above)

    Some retailers use price-embedded layouts instead of weight-embedded —
    we focus on weight-embedded; document the assumption here so callers
    don't accidentally apply weight semantics to a price-embedded scan.

    Returns:
      {"kind": "plain", "code": "<raw>"}                                      — normal scan
      {"kind": "weighed", "plu_code": "PPPPP",
       "weight_kg": Decimal("W.WWW"), "raw_check_digit": int,
       "source_code": "<raw>"}                                                — type-2 weighed
    """
    raw = "" if code is None else str(code).strip()
    if len(raw) == 13 and raw.isdigit() and raw[0] == "2":
        parsed = parse_ean13_type2(raw)
        if parsed is not None:
            return {
                "kind": "weighed",
                "plu_code": parsed["plu"],
                "weight_kg": parsed["qty"],
                "raw_check_digit": int(raw[12]),
                "source_code": raw,
            }
    return {"kind": "plain", "code": raw}
