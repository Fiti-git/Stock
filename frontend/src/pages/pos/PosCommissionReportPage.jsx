import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, MenuItem, Paper, Typography, Box, Divider,
} from "@mui/material";
import AssessmentIcon from "@mui/icons-material/Assessment";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { getCommissionReport, listSalesReps } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const today = () => new Date().toISOString().slice(0, 10);

export default function PosCommissionReportPage() {
  const { notify } = useNotification();
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [repId, setRepId] = useState("");
  const [reps, setReps] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadReps = useCallback(() => {
    listSalesReps().then((r) => setReps(r.data.results || [])).catch(() => {});
  }, []);
  useEffect(() => { loadReps(); }, [loadReps]);

  const generate = async () => {
    setLoading(true);
    try {
      const params = { date_from: dateFrom, date_to: dateTo };
      if (repId) params.rep = repId;
      const r = await getCommissionReport(params);
      setReport(r.data);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    } finally {
      setLoading(false);
    }
  };

  const repColumns = [
    { field: "rep_username", headerName: "Rep", flex: 1 },
    { field: "bill_count", headerName: "Bills", width: 100 },
    { field: "line_total", headerName: "Line Total (LKR)", width: 180 },
    { field: "commission", headerName: "Commission (LKR)", width: 180 },
  ];
  const lineColumns = [
    { field: "bill_no", headerName: "Bill", width: 140 },
    { field: "rep_username", headerName: "Rep", width: 140 },
    { field: "category", headerName: "Category", flex: 1 },
    { field: "line_total", headerName: "Line Total", width: 130 },
    { field: "rate_pct", headerName: "Rate", width: 90 },
    { field: "basis", headerName: "Basis", width: 130 },
    { field: "commission", headerName: "Commission", width: 140 },
  ];

  return (
    <Layout>
      <PageHeader title="Commission Report" subtitle="Earnings per sales rep, per period" icon={<AssessmentIcon />} />
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <TextField label="From" type="date" size="small" value={dateFrom}
            InputLabelProps={{ shrink: true }} onChange={(e) => setDateFrom(e.target.value)} />
          <TextField label="To" type="date" size="small" value={dateTo}
            InputLabelProps={{ shrink: true }} onChange={(e) => setDateTo(e.target.value)} />
          <TextField select size="small" sx={{ minWidth: 180 }} label="Rep (optional)"
            value={repId} onChange={(e) => setRepId(e.target.value)}>
            <MenuItem value=""><em>(all)</em></MenuItem>
            {reps.map((r) => (<MenuItem key={r.id} value={r.id}>{r.username}</MenuItem>))}
          </TextField>
          <Button variant="contained" onClick={generate} disabled={loading}>Generate</Button>
        </Stack>
      </Paper>

      {report && (
        <>
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">
              {report.date_from} → {report.date_to}
            </Typography>
            <Typography variant="body1">
              Bills: <b>{report.totals.bills}</b> · Line Total: <b>LKR {report.totals.line_total}</b>
              {" "}· Commission: <b>LKR {report.totals.commission}</b>
            </Typography>
          </Box>
          <Typography variant="h6" sx={{ mb: 1 }}>By Rep</Typography>
          <DataTable rows={report.by_rep} columns={repColumns} getRowId={(r) => r.rep_id} loading={loading} />
          <Divider sx={{ my: 3 }} />
          <Typography variant="h6" sx={{ mb: 1 }}>Line Detail</Typography>
          <DataTable rows={report.lines.map((l, i) => ({ ...l, _id: i }))}
            columns={lineColumns} getRowId={(r) => r._id} loading={loading} />
        </>
      )}
    </Layout>
  );
}
