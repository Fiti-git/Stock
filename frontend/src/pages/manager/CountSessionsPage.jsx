import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Stack, TextField, Button, Typography, Chip, InputAdornment, MenuItem, Tooltip,
} from "@mui/material";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { listCountSessions } from "../../api/dashboard";
import { useOutlet } from "../../contexts/OutletContext";
import { useNotification } from "../../providers/NotificationProvider";

const SESSION_STATUS_COLORS = { open: "warning", closed: "success" };

export default function CountSessionsPage() {
  const { outletId } = useOutlet();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [statusFilter, setStatusFilter] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCountSessions({
        ...(outletId ? { outlet: outletId } : {}),
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      setData(res.data);
    } catch {
      notify("Failed to load count sessions.", "error");
    } finally {
      setLoading(false);
    }
  }, [outletId, dateFrom, dateTo, statusFilter, notify]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    {
      field: "count_date", headerName: "Count Date", flex: 0.7, minWidth: 120,
    },
    {
      field: "outlet_name", headerName: "Outlet", flex: 1, minWidth: 140,
    },
    {
      field: "status", headerName: "Status", flex: 0.5, minWidth: 90,
      renderCell: (p) => (
        <Chip
          size="small"
          label={p.value?.toUpperCase()}
          color={SESSION_STATUS_COLORS[p.value] || "default"}
        />
      ),
    },
    {
      field: "count_total", headerName: "Counts", type: "number", flex: 0.5, minWidth: 80,
      renderCell: (p) => {
        const { submitted_count, approved_count, count_total } = p.row;
        if (!count_total) return <span style={{ color: "#999" }}>0</span>;
        return (
          <Tooltip title={`${approved_count} approved · ${submitted_count} submitted`}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Chip size="small" label={`${approved_count} ✓`} color="success" variant="outlined" sx={{ fontSize: "0.7rem", height: 20 }} />
              {submitted_count > 0 && <Chip size="small" label={`${submitted_count} pending`} color="warning" variant="outlined" sx={{ fontSize: "0.7rem", height: 20 }} />}
            </Stack>
          </Tooltip>
        );
      },
    },
    {
      field: "variance_pending", headerName: "Variances", type: "number", flex: 0.5, minWidth: 90,
      renderCell: (p) => {
        const { variance_total, variance_pending } = p.row;
        if (!variance_total) return <span style={{ color: "#999" }}>—</span>;
        return (
          <Tooltip title={`${variance_total} total · ${variance_pending} unresolved`}>
            <Chip
              size="small"
              label={variance_pending > 0 ? `${variance_pending} open` : "All resolved"}
              color={variance_pending > 0 ? "error" : "success"}
              variant="outlined"
              sx={{ fontSize: "0.7rem" }}
            />
          </Tooltip>
        );
      },
    },
    {
      field: "started_by_username", headerName: "Started by", flex: 0.7, minWidth: 110,
      renderCell: (p) => p.value || "—",
    },
    {
      field: "closed_at", headerName: "Closed At", flex: 0.8, minWidth: 130,
      renderCell: (p) => {
        if (!p.value) return <span style={{ color: "#999" }}>—</span>;
        return new Date(p.value).toLocaleString();
      },
    },
    {
      field: "_actions", headerName: "", flex: 0.4, minWidth: 80, sortable: false,
      renderCell: (p) => (
        <Button
          size="small"
          startIcon={<OpenInNewIcon sx={{ fontSize: "14px !important" }} />}
          onClick={() => navigate(`/count-sessions/${p.row.id}`)}
          sx={{ textTransform: "none", fontSize: "0.78rem" }}
        >
          Open
        </Button>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        icon={<FactCheckIcon />}
        title="Count Sessions"
        subtitle="Review and manage stock count sessions"
      />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2, flexWrap: "wrap" }}>
        <TextField
          size="small" label="From" type="date" value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
        />
        <TextField
          size="small" label="To" type="date" value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
        />
        <TextField
          select size="small" label="Status" value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ width: 140 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="open">Open</MenuItem>
          <MenuItem value="closed">Closed</MenuItem>
        </TextField>
        <Button
          variant="outlined" size="small" startIcon={<RefreshIcon />}
          onClick={load} sx={{ textTransform: "none" }}
        >
          Refresh
        </Button>
      </Stack>

      <DataTable
        rows={data?.results || []}
        columns={columns}
        loading={loading}
        pageSize={PAGE_SIZE}
        rowCount={data?.count || 0}
        checkboxSelection={false}
        getRowId={(r) => r.id}
      />
    </Layout>
  );
}
