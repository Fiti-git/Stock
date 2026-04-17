import { useEffect, useMemo, useRef, useState } from "react";
import {
  Stack, TextField, MenuItem, InputAdornment, Typography, Chip, Tooltip,
} from "@mui/material";
import SecurityIcon from "@mui/icons-material/Security";
import SearchIcon from "@mui/icons-material/Search";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { getLoginEvents } from "../../api/accounts";

const PAGE_SIZE = 50;

export default function LoginEventsPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [userFilter, setUserFilter] = useState("");
  const [ipFilter, setIpFilter] = useState("");
  const [successFilter, setSuccessFilter] = useState(""); // "", "true", "false"
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const debounce = useRef(null);

  const successBool = successFilter === "true" ? true : successFilter === "false" ? false : undefined;

  const fetchPage = (p = 1) => {
    setLoading(true);
    getLoginEvents({
      user: userFilter.trim(),
      ip: ipFilter.trim(),
      success: successBool,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      page: p,
    })
      .then(({ data }) => {
        setRows(data.results || []);
        setTotal(data.count || 0);
      })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  // Initial + filter change (debounced for text fields, immediate for selects/dates)
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setPage(1);
      fetchPage(1);
    }, 280);
    return () => debounce.current && clearTimeout(debounce.current);
    // eslint-disable-next-line
  }, [userFilter, ipFilter, successFilter, fromDate, toDate]);

  useEffect(() => { fetchPage(page); /* eslint-disable-next-line */ }, [page]);

  const columns = useMemo(() => [
    {
      field: "created_at", headerName: "When", width: 180,
      valueGetter: (v) => v ? new Date(v).toLocaleString() : "—",
    },
    {
      field: "success", headerName: "Status", width: 110,
      renderCell: (p) => p.value
        ? <Chip size="small" label="OK" color="success" variant="outlined" />
        : <Chip size="small" label="FAIL" color="error" variant="outlined" />,
    },
    { field: "username", headerName: "User", flex: 0.7, minWidth: 130 },
    {
      field: "ip_address", headerName: "IP", width: 140,
      renderCell: (p) => <Typography variant="body2" sx={{ fontFamily: "monospace" }}>{p.value || "—"}</Typography>,
    },
    {
      field: "user_agent", headerName: "User-Agent", flex: 1.6, minWidth: 240,
      renderCell: (p) => (
        <Tooltip title={p.value || ""}>
          <Typography variant="body2" noWrap sx={{ maxWidth: "100%" }}>{p.value || "—"}</Typography>
        </Tooltip>
      ),
    },
    {
      field: "platform", headerName: "Platform", width: 100,
      renderCell: (p) => p.value ? <Chip size="small" label={p.value} variant="outlined" /> : "—",
    },
    { field: "app_version", headerName: "App", width: 80, valueGetter: (v) => v || "—" },
    {
      field: "device_uuid", headerName: "Device UUID", width: 260,
      renderCell: (p) => <Typography variant="caption" sx={{ fontFamily: "monospace" }}>{p.value || "—"}</Typography>,
    },
    { field: "failure_reason", headerName: "Failure reason", flex: 0.8, minWidth: 160,
      valueGetter: (v) => v || "" },
  ], []);

  return (
    <Layout>
      <PageHeader
        title="Login Events"
        subtitle="Every login attempt to the web/mobile API with IP, browser/device, and outcome."
        icon={<SecurityIcon />}
      />

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <TextField
          size="small" placeholder="Username" value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ minWidth: 180 }}
        />
        <TextField
          size="small" placeholder="IP address" value={ipFilter}
          onChange={(e) => setIpFilter(e.target.value)}
          sx={{ minWidth: 160 }}
        />
        <TextField
          size="small" select label="Result" value={successFilter}
          onChange={(e) => setSuccessFilter(e.target.value)}
          sx={{ minWidth: 130 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="true">Success</MenuItem>
          <MenuItem value="false">Failure</MenuItem>
        </TextField>
        <TextField
          size="small" type="date" label="From"
          InputLabelProps={{ shrink: true }}
          value={fromDate} onChange={(e) => setFromDate(e.target.value)}
        />
        <TextField
          size="small" type="date" label="To"
          InputLabelProps={{ shrink: true }}
          value={toDate} onChange={(e) => setToDate(e.target.value)}
        />
      </Stack>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        paginationMode="server"
        rowCount={total}
        paginationModel={{ page: page - 1, pageSize: PAGE_SIZE }}
        onPaginationModelChange={(m) => setPage(m.page + 1)}
        pageSizeOptions={[PAGE_SIZE]}
        emptyText="No login events match these filters"
        height={640}
      />
    </Layout>
  );
}
