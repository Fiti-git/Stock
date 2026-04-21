import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Typography, Chip, Alert, InputAdornment,
} from "@mui/material";
import ChecklistIcon from "@mui/icons-material/Checklist";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { getDailyCounts } from "../../api/dashboard";
import { useOutlet } from "../../contexts/OutletContext";

export default function CountedStockDailyPage() {
  const { outletId } = useOutlet();
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getDailyCounts({ outletId, dateFrom, dateTo, search, page, pageSize: PAGE_SIZE });
      setData(res.data);
    } catch (err) { setError(err?.response?.data?.detail || "Failed to load data."); }
    finally { setLoading(false); }
  }, [outletId, dateFrom, dateTo, search, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [outletId, dateFrom, dateTo, search]);

  const columns = [
    { field: "count_date", headerName: "Date", flex: 0.7, minWidth: 110 },
    { field: "item_code", headerName: "Item Code", flex: 0.8, minWidth: 110 },
    { field: "item_name", headerName: "Item Name", flex: 1.6, minWidth: 220 },
    { field: "category", headerName: "Category", flex: 0.8, minWidth: 110, valueGetter: (v) => v || "—" },
    {
      field: "location_tag", headerName: "Location", flex: 0.7, minWidth: 110,
      renderCell: (p) => p.value ? <Chip size="small" label={p.value} color="primary" variant="outlined" /> : "—",
    },
    { field: "actual_qty", headerName: "Qty Counted", type: "number", flex: 0.7, minWidth: 110 },
    { field: "counted_by_username", headerName: "Counted By", flex: 0.9, minWidth: 120, valueGetter: (v) => v || "—" },
    {
      field: "counted_at", headerName: "Time", flex: 0.7, minWidth: 100,
      valueGetter: (v) => v ? new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—",
    },
  ];

  return (
    <Layout>
      <PageHeader title="Counted Stock Daily" subtitle="Daily record of physical counts" icon={<ChecklistIcon />} />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} inputProps={{ min: dateFrom }} />
        <TextField size="small" placeholder="Search item code or name…" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>

      {data && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
          {data.count} record{data.count !== 1 ? "s" : ""}{" "}
          {dateFrom === dateTo
            ? <>for <b>{dateFrom}</b></>
            : <>from <b>{dateFrom}</b> to <b>{dateTo}</b></>}
        </Typography>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <DataTable
        rows={data?.results ?? []}
        columns={columns}
        loading={loading}
        paginationMode="server"
        rowCount={data?.count ?? 0}
        paginationModel={{ page: page - 1, pageSize: PAGE_SIZE }}
        onPaginationModelChange={(m) => setPage(m.page + 1)}
        pageSizeOptions={[PAGE_SIZE]}
        emptyText="No counts recorded for this date"
        height={620}
      />
    </Layout>
  );
}
