import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Typography, Paper, Alert, Chip, Box,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import AssessmentIcon from "@mui/icons-material/Assessment";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import {
  generateGLExport, listGLExports, getGLExport, downloadGLExport,
} from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const today = () => new Date().toISOString().slice(0, 10);

export default function PosGLExportPage() {
  const { notify } = useNotification();
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [shiftId, setShiftId] = useState("");
  const [working, setWorking] = useState(false);
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(async () => {
    try {
      const r = await listGLExports();
      setHistory(r.data.results || []);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed to load history.", "error");
    }
  }, [notify]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const generate = async () => {
    setWorking(true);
    try {
      const payload = { date_from: dateFrom, date_to: dateTo };
      if (shiftId) payload.shift_id = Number(shiftId);
      const r = await generateGLExport(payload);
      setCurrent(r.data);
      notify("GL export generated.", "success");
      loadHistory();
    } catch (err) {
      notify(err?.response?.data?.detail || "Generate failed.", "error");
    } finally { setWorking(false); }
  };

  const downloadCsv = async (id) => {
    try {
      const r = await downloadGLExport(id);
      const blob = new Blob([r.data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gl-export-${id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify(err?.response?.data?.detail || "Download failed.", "error");
    }
  };

  const openHistoryRow = async (row) => {
    try {
      const r = await getGLExport(row.id);
      setCurrent(r.data);
    } catch (err) {
      notify(err?.response?.data?.detail || "Load failed.", "error");
    }
  };

  const entryColumns = [
    { field: "entry_date", headerName: "Date", flex: 0.5, minWidth: 100 },
    { field: "reference", headerName: "Ref", flex: 0.5, minWidth: 100 },
    { field: "account_code", headerName: "Code", flex: 0.4, minWidth: 80 },
    { field: "account_name", headerName: "Account", flex: 1, minWidth: 140 },
    { field: "debit", headerName: "Debit", flex: 0.5, minWidth: 90, valueGetter: (v) => Number(v || 0).toFixed(2) },
    { field: "credit", headerName: "Credit", flex: 0.5, minWidth: 90, valueGetter: (v) => Number(v || 0).toFixed(2) },
    { field: "memo", headerName: "Narration", flex: 1, minWidth: 140 },
  ];

  const historyColumns = [
    { field: "id", headerName: "#", flex: 0.3, minWidth: 60 },
    { field: "date_from", headerName: "From", flex: 0.5, minWidth: 100 },
    { field: "date_to", headerName: "To", flex: 0.5, minWidth: 100 },
    { field: "status", headerName: "Status", flex: 0.4, minWidth: 90,
      renderCell: (p) => <Chip size="small" label={p.value} /> },
    { field: "totals", headerName: "Totals", flex: 1.2, minWidth: 200,
      renderCell: (p) => {
        const t = p.value || {};
        return <span>D {t.total_debit || "0"} / C {t.total_credit || "0"} · {t.bills || 0} bills</span>;
      } },
    { field: "generated_by_username", headerName: "By", flex: 0.5, minWidth: 90 },
    { field: "generated_at", headerName: "At", flex: 0.7, minWidth: 140,
      valueGetter: (v) => v ? new Date(v).toLocaleString() : "" },
    { field: "actions", headerName: "", flex: 0.7, minWidth: 160, sortable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={() => openHistoryRow(p.row)}>View</Button>
          <Button size="small" startIcon={<DownloadIcon />} onClick={() => downloadCsv(p.row.id)}>CSV</Button>
        </Stack>
      ) },
  ];

  return (
    <Layout>
      <PageHeader title="GL Export" subtitle="Generate Tally-compatible journal CSV" icon={<AssessmentIcon />} />
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <TextField type="date" label="From" InputLabelProps={{ shrink: true }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} size="small" />
          <TextField type="date" label="To" InputLabelProps={{ shrink: true }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} size="small" />
          <TextField label="Shift ID (optional)" value={shiftId} onChange={(e) => setShiftId(e.target.value)} size="small" sx={{ width: 160 }} />
          <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={generate} disabled={working}>Generate</Button>
          <Button startIcon={<RefreshIcon />} onClick={loadHistory}>Refresh history</Button>
        </Stack>
      </Paper>

      {current && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap">
            <Typography variant="subtitle1">Export #{current.id}</Typography>
            <Chip size="small" label={current.status} />
            <Typography variant="body2" color="text.secondary">
              Bills: {current.totals?.bills || 0} · Debit {current.totals?.total_debit || 0} · Credit {current.totals?.total_credit || 0}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Button startIcon={<DownloadIcon />} variant="contained" onClick={() => downloadCsv(current.id)}>Download CSV</Button>
          </Stack>
          {current.totals?.warnings?.length ? (
            <Alert severity="warning" sx={{ mb: 1 }}>
              {current.totals.warnings.join("; ")}
            </Alert>
          ) : null}
          <DataTable
            rows={(current.entries || []).map((e, i) => ({ ...e, id: e.id || i }))}
            columns={entryColumns} height={400} emptyText="No entries"
          />
        </Paper>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>History</Typography>
      <DataTable rows={history} columns={historyColumns} getRowId={(r) => r.id} height={400} emptyText="No exports yet" />
    </Layout>
  );
}
