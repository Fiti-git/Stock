import { useEffect, useMemo, useState } from "react";
import {
  Box, Card, CardContent, Typography, Stack, TextField, MenuItem, Chip,
  Button, Pagination, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Paper,
  IconButton, Tooltip,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloseIcon from "@mui/icons-material/Close";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { getUploadedSheets, getUploadedSheetDetail } from "../../api/uploads";
import { getOutlets } from "../../api/outlets";
import { useAuth } from "../../contexts/AuthContext";

const PIPELINES = [
  { value: "", label: "All pipelines" },
  { value: "pos", label: "POS Snapshot" },
  { value: "damage", label: "Damage / Wastage" },
  { value: "office", label: "Office Use" },
  { value: "verification", label: "Verification" },
  { value: "grn", label: "GRN" },
  { value: "rts", label: "Return to Supplier" },
  { value: "sales", label: "Sales" },
  { value: "sales_returns", label: "Sales Returns" },
];

const STATUS_CHIPS = {
  auto: { label: "Auto", color: "success" },
  approved: { label: "Approved", color: "success" },
  pending: { label: "Pending", color: "warning" },
  rejected: { label: "Rejected", color: "error" },
};

export default function UploadedSheetsPage() {
  const notify = useNotify();
  const { user } = useAuth();
  const isAdmin = ["admin", "super_admin"].includes(user?.role);

  const [outlets, setOutlets] = useState([]);
  const [filters, setFilters] = useState({
    pipeline: "",
    outlet_id: "",
    approval_status: "",
    from_date: "",
    to_date: "",
  });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [data, setData] = useState({ count: 0, total_pages: 1, results: [] });
  const [loading, setLoading] = useState(false);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    getOutlets().then((r) => setOutlets(r.data || [])).catch(() => {});
  }, [isAdmin]);

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const r = await getUploadedSheets(params);
      setData(r.data);
    } catch (err) {
      notify.error(err.response?.data?.detail || "Failed to load uploaded sheets.");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, filters]);

  const setFilter = (k, v) => { setPage(1); setFilters((p) => ({ ...p, [k]: v })); };

  const openDetail = async (sheetId) => {
    setDetailLoading(true);
    setDetail({ id: sheetId });
    try {
      const r = await getUploadedSheetDetail(sheetId);
      setDetail(r.data);
    } catch (err) {
      notify.error(err.response?.data?.detail || "Failed to load sheet.");
      setDetail(null);
    } finally { setDetailLoading(false); }
  };

  const closeDetail = () => setDetail(null);

  const columns = detail?.columns || [];
  const rows = detail?.rows || [];

  return (
    <Layout>
      <PageHeader title="Uploaded XLS Sheets" subtitle="All file uploads across every pipeline" />
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center">
            <TextField select size="small" label="Pipeline" value={filters.pipeline}
              onChange={(e) => setFilter("pipeline", e.target.value)} sx={{ minWidth: 180 }}>
              {PIPELINES.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
            </TextField>
            {isAdmin && (
              <TextField select size="small" label="Outlet" value={filters.outlet_id}
                onChange={(e) => setFilter("outlet_id", e.target.value)} sx={{ minWidth: 200 }}>
                <MenuItem value="">All outlets</MenuItem>
                {outlets.map((o) => <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>)}
              </TextField>
            )}
            <TextField select size="small" label="Status" value={filters.approval_status}
              onChange={(e) => setFilter("approval_status", e.target.value)} sx={{ minWidth: 140 }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="auto">Auto</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
            </TextField>
            <TextField type="date" size="small" label="From" InputLabelProps={{ shrink: true }}
              value={filters.from_date} onChange={(e) => setFilter("from_date", e.target.value)} />
            <TextField type="date" size="small" label="To" InputLabelProps={{ shrink: true }}
              value={filters.to_date} onChange={(e) => setFilter("to_date", e.target.value)} />
            <Tooltip title="Refresh">
              <IconButton onClick={load} disabled={loading}><RefreshIcon /></IconButton>
            </Tooltip>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Pipeline</TableCell>
                  <TableCell>Outlet</TableCell>
                  <TableCell>Business Date</TableCell>
                  <TableCell>Uploaded By</TableCell>
                  <TableCell>Uploaded At</TableCell>
                  <TableCell>File</TableCell>
                  <TableCell align="right">Rows</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="center">View</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.results.length === 0 && !loading && (
                  <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: "text.secondary" }}>
                    No uploaded sheets found.
                  </TableCell></TableRow>
                )}
                {data.results.map((s) => {
                  const chip = STATUS_CHIPS[s.approval_status] || { label: s.approval_status, color: "default" };
                  return (
                    <TableRow key={s.id} hover>
                      <TableCell>{s.pipeline_label}</TableCell>
                      <TableCell>{s.outlet_name}</TableCell>
                      <TableCell>
                        {s.business_date}{s.business_date_to && s.business_date_to !== s.business_date ? ` – ${s.business_date_to}` : ""}
                      </TableCell>
                      <TableCell>{s.uploaded_by || "—"}</TableCell>
                      <TableCell>{new Date(s.uploaded_at).toLocaleString()}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.filename}
                      </TableCell>
                      <TableCell align="right">{s.row_count}</TableCell>
                      <TableCell>
                        <Chip size="small" label={chip.label} color={chip.color} variant={s.approval_reason ? "outlined" : "filled"} />
                        {s.approval_reason && <Typography variant="caption" sx={{ ml: 0.5, color: "text.secondary" }}>{s.approval_reason}</Typography>}
                      </TableCell>
                      <TableCell align="center">
                        <Button size="small" startIcon={<VisibilityIcon />} onClick={() => openDetail(s.id)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack alignItems="center" sx={{ mt: 2 }}>
            <Pagination count={data.total_pages} page={page} onChange={(_, p) => setPage(p)} />
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={!!detail} onClose={closeDetail} maxWidth="xl" fullWidth>
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6">{detail?.pipeline_label || "Uploaded Sheet"}</Typography>
              <Typography variant="caption" color="text.secondary">
                {detail?.outlet_name} · {detail?.business_date}
                {detail?.business_date_to && detail.business_date_to !== detail.business_date ? ` – ${detail.business_date_to}` : ""}
                {" · "}{detail?.filename}
              </Typography>
            </Box>
            <IconButton onClick={closeDetail}><CloseIcon /></IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {detailLoading && <Alert severity="info">Loading...</Alert>}
          {!detailLoading && rows.length === 0 && <Alert severity="info">No rows recorded for this upload.</Alert>}
          {!detailLoading && rows.length > 0 && (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: "70vh" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                    {columns.map((c) => <TableCell key={c} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{c}</TableCell>)}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell>{idx + 1}</TableCell>
                      {columns.map((c) => (
                        <TableCell key={c} sx={{ whiteSpace: "nowrap" }}>
                          {r[c] === null || r[c] === undefined ? "" : String(r[c])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDetail}>Close</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
