import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, MenuItem, Button, Chip, Typography,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import InventoryIcon from "@mui/icons-material/Inventory";
import RefreshIcon from "@mui/icons-material/Refresh";
import TuneIcon from "@mui/icons-material/Tune";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { listStockMovements, adjustStock } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const KIND_COLORS = {
  sale: "primary", void: "warning", return: "info",
  grn: "success", damage: "error", adjustment: "default",
  variance: "secondary", opening: "default",
};

const KINDS = ["sale", "void", "return", "grn", "damage", "adjustment", "variance", "opening"];

export default function PosStockMovementsPage() {
  const { notify } = useNotification();
  const [kind, setKind] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjForm, setAdjForm] = useState({ item_id: "", qty_change: "", note: "" });
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listStockMovements({
        ...(kind ? { kind } : {}),
        page, page_size: PAGE_SIZE,
      });
      setData(res.data);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    } finally {
      setLoading(false);
    }
  }, [kind, page, notify]);

  useEffect(() => { load(); }, [load]);

  const doAdjust = async () => {
    try {
      await adjustStock(Number(adjForm.item_id), adjForm.qty_change, adjForm.note);
      notify("Stock adjusted.", "success");
      setAdjustOpen(false);
      setAdjForm({ item_id: "", qty_change: "", note: "" });
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    }
  };

  const cols = [
    { field: "created_at", headerName: "When", flex: 1, minWidth: 150, valueGetter: (v) => new Date(v).toLocaleString() },
    { field: "item_code", headerName: "Item Code", flex: 0.8, minWidth: 100 },
    { field: "item_name", headerName: "Item Name", flex: 1.5, minWidth: 200 },
    { field: "kind", headerName: "Kind", flex: 0.6, minWidth: 90,
      renderCell: (p) => <Chip size="small" label={p.value} color={KIND_COLORS[p.value] || "default"} /> },
    { field: "qty_change", headerName: "Qty Δ", type: "number", flex: 0.5, minWidth: 80,
      renderCell: (p) => <span style={{ color: Number(p.value) < 0 ? "#d32f2f" : "#2e7d32", fontWeight: 600 }}>
        {Number(p.value) > 0 ? "+" : ""}{Number(p.value).toFixed(3).replace(/\.?0+$/, "")}
      </span> },
    { field: "balance_after", headerName: "After", type: "number", flex: 0.5, minWidth: 80,
      valueGetter: (v) => Number(v).toFixed(3).replace(/\.?0+$/, "") },
    { field: "ref_type", headerName: "Ref", flex: 0.8, minWidth: 100,
      valueGetter: (_, r) => r.ref_type ? `${r.ref_type} #${r.ref_id}` : "—" },
    { field: "note", headerName: "Note", flex: 1.5, minWidth: 180 },
    { field: "created_by", headerName: "By", flex: 0.6, minWidth: 90, valueGetter: (v) => v || "—" },
  ];

  return (
    <Layout>
      <PageHeader title="Stock Movements" subtitle="Every inventory change, append-only" icon={<InventoryIcon />} />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" select label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="">All</MenuItem>
          {KINDS.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
        </TextField>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
        <Button variant="contained" color="secondary" startIcon={<TuneIcon />} onClick={() => setAdjustOpen(true)}>Adjust Stock</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">{data?.count || 0} movements</Typography>
      <DataTable
        rows={data?.results ?? []} columns={cols} loading={loading}
        paginationMode="server" rowCount={data?.count ?? 0}
        paginationModel={{ page: page - 1, pageSize: PAGE_SIZE }}
        onPaginationModelChange={(m) => setPage(m.page + 1)}
        pageSizeOptions={[PAGE_SIZE]} height={600} emptyText="No movements"
      />

      <Dialog open={adjustOpen} onClose={() => setAdjustOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Manual stock adjustment</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Item ID" value={adjForm.item_id} onChange={(e) => setAdjForm({ ...adjForm, item_id: e.target.value })} />
            <TextField label="Qty change (+/-)" value={adjForm.qty_change} onChange={(e) => setAdjForm({ ...adjForm, qty_change: e.target.value })} helperText="Positive to add, negative to remove" />
            <TextField label="Note" multiline minRows={2} value={adjForm.note} onChange={(e) => setAdjForm({ ...adjForm, note: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={doAdjust} disabled={!adjForm.item_id || !adjForm.qty_change}>Apply</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
