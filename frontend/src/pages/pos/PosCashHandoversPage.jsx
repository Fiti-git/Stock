import { useState, useEffect, useCallback } from "react";
import { Stack, TextField, MenuItem, Button, Chip, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import PaymentsIcon from "@mui/icons-material/Payments";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { listCashHandovers } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

export default function PosCashHandoversPage() {
  const { notify } = useNotification();
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listCashHandovers(status ? { status } : {});
      setRows(r.data.results || []);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    } finally { setLoading(false); }
  }, [status, notify]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    { field: "id", headerName: "#", flex: 0.3, minWidth: 60 },
    { field: "shift", headerName: "Shift", flex: 0.4, minWidth: 70 },
    { field: "cashier_username", headerName: "Cashier", flex: 0.7, minWidth: 110 },
    { field: "collected_by_username", headerName: "Collected by", flex: 0.7, minWidth: 120 },
    { field: "expected_cash", headerName: "Expected", flex: 0.6, minWidth: 100, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "counted_cash", headerName: "Counted", flex: 0.6, minWidth: 100, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "variance", headerName: "Variance", flex: 0.6, minWidth: 100,
      renderCell: (p) => {
        const n = Number(p.value);
        return <span style={{ color: n === 0 ? "inherit" : (n < 0 ? "#d32f2f" : "#ed6c02"), fontWeight: 600 }}>{n.toFixed(2)}</span>;
      } },
    { field: "safe_deposit_ref", headerName: "Slip Ref", flex: 0.6, minWidth: 100 },
    { field: "status", headerName: "Status", flex: 0.5, minWidth: 90,
      renderCell: (p) => <Chip size="small" label={p.value} color={p.value === "accepted" ? "success" : (p.value === "disputed" ? "error" : "default")} /> },
    { field: "collected_at", headerName: "When", flex: 0.8, minWidth: 150,
      valueGetter: (v) => v ? new Date(v).toLocaleString() : "" },
  ];

  return (
    <Layout>
      <PageHeader title="Cash Handovers" subtitle="Manager-attested till handovers" icon={<PaymentsIcon />} />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="accepted">Accepted</MenuItem>
          <MenuItem value="disputed">Disputed</MenuItem>
        </TextField>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">{rows.length} handover{rows.length !== 1 ? "s" : ""}</Typography>
      <DataTable rows={rows} columns={columns} loading={loading} getRowId={(r) => r.id} height={600} emptyText="No handovers" />
    </Layout>
  );
}
