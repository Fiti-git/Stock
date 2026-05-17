"""
Maps each UploadedSheet.pipeline value to its line model and query details.
Used by the sheet-detail endpoint to serve row data from line tables instead
of the (now deprecated) UploadedSheet.rows JSONField.
"""
from decimal import Decimal
from datetime import date as _date, datetime, time as _time


def _safe(v):
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (_date, datetime, _time)):
        return v.isoformat()
    return str(v)


# ------------------------------------------------------------------
# Per-pipeline row serializers
# ------------------------------------------------------------------

def _pos_row(obj):
    return {
        "item_id":        obj.item_id,
        "item_code":      obj.item.item_code if obj.item_id else "",
        "item_name":      obj.item.item_name if obj.item_id else "",
        "snapshot_date":  _safe(obj.snapshot_date),
        "pos_quantity":   _safe(obj.pos_quantity),
        "cost_price":     _safe(obj.cost_price),
        "selling_price":  _safe(obj.selling_price),
    }


def _txn17_row(obj):
    return {
        "doc_no":        obj.doc_no,
        "txn_date":      _safe(obj.txn_date),
        "txn_time":      obj.txn_time,
        "item_code":     obj.item_code,
        "description":   obj.description,
        "pack_size":     obj.pack_size,
        "qty":           _safe(obj.qty),
        "amount":        _safe(obj.amount),
        "cost_price":    _safe(obj.cost_price),
        "selling_price": _safe(obj.selling_price),
        "user_name":     obj.user_name,
    }


def _txn19_row(obj):
    return {
        "do_no":          obj.do_no,
        "supplier_code":  obj.supplier_code,
        "invoice_no":     obj.invoice_no,
        "txn_date":       _safe(obj.txn_date),
        "txn_time":       obj.txn_time,
        "item_code":      obj.item_code,
        "description":    obj.description,
        "pack_size":      obj.pack_size,
        "packs":          _safe(obj.packs),
        "qty":            _safe(obj.qty),
        "free_qty":       _safe(obj.free_qty),
        "cost_price":     _safe(obj.cost_price),
        "selling_price":  _safe(obj.selling_price),
        "disc_pct":       _safe(obj.disc_pct),
        "amount":         _safe(obj.amount),
        "tax_pct":        _safe(obj.tax_pct),
        "tax_amount":     _safe(obj.tax_amount),
        "user_name":      obj.user_name,
    }


def _sales_row(obj):
    return {
        "invoice_no":  obj.invoice_no,
        "txn_date":    _safe(obj.txn_date),
        "txn_time":    obj.txn_time,
        "item_code":   obj.item_code,
        "description": obj.description,
        "cust_code":   obj.cust_code,
        "qty":         _safe(obj.qty),
        "unit_price":  _safe(obj.unit_price),
        "cost_price":  _safe(obj.cost_price),
        "discount":    _safe(obj.discount),
        "amount":      _safe(obj.amount),
        "cashier":     obj.cashier,
    }


def _sales_return_row(obj):
    return {
        "invoice_no":  obj.invoice_no,
        "txn_date":    _safe(obj.txn_date),
        "txn_time":    obj.txn_time,
        "item_code":   obj.item_code,
        "barcode":     obj.barcode,
        "description": obj.description,
        "member":      obj.member,
        "qty":         _safe(obj.qty),
        "cost_price":  _safe(obj.cost_price),
        "gross_value": _safe(obj.gross_value),
        "remarks":     obj.remarks,
        "user_name":   obj.user_name,
    }


# ------------------------------------------------------------------
# Column name lists (for the columns header even when rows=[] on old records)
# ------------------------------------------------------------------

POS_COLUMNS = ["item_code", "item_name", "snapshot_date", "pos_quantity", "cost_price", "selling_price"]
TXN17_COLUMNS = ["doc_no", "txn_date", "txn_time", "item_code", "description", "pack_size", "qty", "amount", "cost_price", "selling_price", "user_name"]
TXN19_COLUMNS = ["do_no", "supplier_code", "invoice_no", "txn_date", "txn_time", "item_code", "description", "pack_size", "packs", "qty", "free_qty", "cost_price", "selling_price", "disc_pct", "amount", "tax_pct", "tax_amount", "user_name"]
SALES_COLUMNS = ["invoice_no", "txn_date", "txn_time", "item_code", "description", "cust_code", "qty", "unit_price", "cost_price", "discount", "amount", "cashier"]
SALES_RETURN_COLUMNS = ["invoice_no", "txn_date", "txn_time", "item_code", "barcode", "description", "member", "qty", "cost_price", "gross_value", "remarks", "user_name"]


def get_pipeline_config(pipeline: str) -> dict:
    """
    Returns dict with:
      model        — Django model class
      batch_fk     — field name on the model that points to the batch/log PK
      row_fn       — callable(instance) -> dict
      columns      — fallback column list if sheet.columns is empty
      select_rel   — list of related fields to select_related (may be empty)
    """
    from .models import (
        PosSnapshot,
        DamageLine, OfficeLine, VerificationLine,
        GrnLine, RtsLine,
        SalesLine, SalesReturnLine,
    )
    configs = {
        "pos": {
            "model": PosSnapshot,
            "batch_fk": "upload_batch_id",
            "row_fn": _pos_row,
            "columns": POS_COLUMNS,
            "select_rel": ["item"],
        },
        "damage": {
            "model": DamageLine,
            "batch_fk": "batch_id",
            "row_fn": _txn17_row,
            "columns": TXN17_COLUMNS,
            "select_rel": [],
        },
        "office": {
            "model": OfficeLine,
            "batch_fk": "batch_id",
            "row_fn": _txn17_row,
            "columns": TXN17_COLUMNS,
            "select_rel": [],
        },
        "verification": {
            "model": VerificationLine,
            "batch_fk": "batch_id",
            "row_fn": _txn17_row,
            "columns": TXN17_COLUMNS,
            "select_rel": [],
        },
        "grn": {
            "model": GrnLine,
            "batch_fk": "batch_id",
            "row_fn": _txn19_row,
            "columns": TXN19_COLUMNS,
            "select_rel": [],
        },
        "rts": {
            "model": RtsLine,
            "batch_fk": "batch_id",
            "row_fn": _txn19_row,
            "columns": TXN19_COLUMNS,
            "select_rel": [],
        },
        "sales": {
            "model": SalesLine,
            "batch_fk": "batch_id",
            "row_fn": _sales_row,
            "columns": SALES_COLUMNS,
            "select_rel": [],
        },
        "sales_returns": {
            "model": SalesReturnLine,
            "batch_fk": "batch_id",
            "row_fn": _sales_return_row,
            "columns": SALES_RETURN_COLUMNS,
            "select_rel": [],
        },
    }
    return configs.get(pipeline)
