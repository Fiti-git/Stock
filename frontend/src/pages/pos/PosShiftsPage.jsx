import { useState, useEffect, useCallback } from "react";
import { Stack, TextField, MenuItem, Button, Chip, Typography } from "@mui/material";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { listShifts } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

export default function PosShiftsPage() {
  const { notify } = useNotification();
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listShifts(status ? { status } : {});
      setRows(res.data.results || []);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed to load.", "error");
    } finally {
      setLoading(false);
    }
  }, [status, notify]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    { field: "id", headerName: "#", flex: 0.3, minWidth: 60 },
    { field: "outlet_name", headerName: "Outlet", flex: 1, minWidth: 120 },
    { field: "opened_by_username", headerName: "Cashier", flex: 0.8, minWidth: 100 },
    { field: "opened_at", headerName: "Opened", flex: 1, minWidth: 140, valueGetter: (v) => v ? new Date(v).toLocaleString() : "—" },
    { field: "closed_at", headerName: "Closed", flex: 1, minWidth: 140, valueGetter: (v) => v ? new Date(v).toLocaleString() : "—" },
    { field: "bill_count", headerName: "Bills", flex: 0.4, minWidth: 60, type: "number" },
    { field: "opening_cash", headerName: "Opening", flex: 0.6, minWidth: 90, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "cash_sales", headerName: "Cash Sales", flex: 0.7, minWidth: 100, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "expected_cash", headerName: "Expected", flex: 0.7, minWidth: 100, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "counted_cash", headerName: "Counted", flex: 0.7, minWidth: 100, valueGetter: (v) => v === null || v === undefined ? "—" : Number(v).toFixed(2) },
    {
      field: "cash_variance", headerName: "Variance", flex: 0.7, minWidth: 100,
      renderCell: (p) => {
        if (p.value === null || p.value === undefined) return "—";
        const n = Number(p.value);
        return <span style={{ color: n === 0 ? "inherit" : (n < 0 ? "#d32f2f" : "#ed6c02"), fontWeight: 600 }}>{n.toFixed(2)}</span>;
      },
    },
    { field: "status", headerName: "Status", flex: 0.5, minWidth: 90,
      renderCell: (p) => <Chip size="small" label={p.value} color={p.value === "open" ? "success" : "default"} />,
    },
  ];

  return (
    <Layout>
      <PageHeader title="POS Shifts" subtitle="Till sessions, cash reconciliation" icon={<ReceiptLongIcon />} />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="open">Open</MenuItem>
          <MenuItem value="closed">Closed</MenuItem>
        </TextField>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">{rows.length} shift{rows.length !== 1 ? "s" : ""}</Typography>
      <DataTable rows={rows} columns={columns} loading={loading} getRowId={(r) => r.id} height={600} emptyText="No shifts" />
    </Layout>
  );
}
