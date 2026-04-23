import { useState, useEffect, useCallback } from "react";
import { Stack, TextField, Button, Chip, Typography, InputAdornment } from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { getPriceHistory } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const SOURCE_COLORS = {
  manual: "default", grn: "info", bulk_update: "primary", api: "secondary",
};

export default function PosPriceHistoryPage() {
  const { notify } = useNotification();
  const [itemId, setItemId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPriceHistory({
        ...(itemId ? { item: itemId } : {}),
        page, page_size: PAGE_SIZE,
      });
      setData(res.data);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    } finally {
      setLoading(false);
    }
  }, [itemId, page, notify]);

  useEffect(() => { load(); }, [load]);

  const fmt = (v) => v === null || v === undefined ? "—" : Number(v).toFixed(2);

  const cols = [
    { field: "created_at", headerName: "When", flex: 1, minWidth: 150, valueGetter: (v) => new Date(v).toLocaleString() },
    { field: "item_code", headerName: "Item Code", flex: 0.7, minWidth: 100 },
    { field: "item_name", headerName: "Item Name", flex: 1.4, minWidth: 200 },
    { field: "old_sell", headerName: "Old Sell", flex: 0.6, minWidth: 90, valueGetter: (v) => fmt(v) },
    { field: "new_sell", headerName: "New Sell", flex: 0.6, minWidth: 90,
      renderCell: (p) => <b>{fmt(p.value)}</b> },
    { field: "_delta", headerName: "Δ", flex: 0.5, minWidth: 80,
      valueGetter: (_, r) => Number(r.new_sell || 0) - Number(r.old_sell || 0),
      renderCell: (p) => {
        const v = Number(p.value);
        return <span style={{ color: v === 0 ? "inherit" : (v > 0 ? "#2e7d32" : "#d32f2f"), fontWeight: 600 }}>
          {v > 0 ? "+" : ""}{v.toFixed(2)}
        </span>;
      },
    },
    { field: "source", headerName: "Source", flex: 0.6, minWidth: 100,
      renderCell: (p) => <Chip size="small" label={p.value} color={SOURCE_COLORS[p.value] || "default"} /> },
    { field: "changed_by", headerName: "By", flex: 0.6, minWidth: 100, valueGetter: (v) => v || "—" },
    { field: "note", headerName: "Note", flex: 1.2, minWidth: 180 },
  ];

  return (
    <Layout>
      <PageHeader title="Price History" subtitle="Item sell/cost price changes" icon={<HistoryIcon />} />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Filter by item id (optional)" value={itemId} onChange={(e) => setItemId(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} sx={{ flex: 1, maxWidth: 300 }} />
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">{data?.count || 0} change{data?.count !== 1 ? "s" : ""}</Typography>
      <DataTable
        rows={data?.results ?? []} columns={cols} loading={loading}
        paginationMode="server" rowCount={data?.count ?? 0}
        paginationModel={{ page: page - 1, pageSize: PAGE_SIZE }}
        onPaginationModelChange={(m) => setPage(m.page + 1)}
        pageSizeOptions={[PAGE_SIZE]} height={600} emptyText="No price changes"
      />
    </Layout>
  );
}
