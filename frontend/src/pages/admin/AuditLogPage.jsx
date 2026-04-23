import { useState, useEffect } from "react";
import {
  Stack, TextField, MenuItem, Box, Card, CardContent, IconButton, Collapse, Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ListAltIcon from "@mui/icons-material/ListAlt";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { getAuditLog } from "../../api/uploads";

const ACTION_LABELS = {
  xls_upload: "XLS Upload",
  xls_upload_pending_approval: "Upload (Pending)",
  approve_upload: "Approve Upload",
  reject_upload: "Reject Upload",
  delete_upload: "Delete Upload",
  assign_barcode: "Assign Barcode",
  accept_item_change: "Accept Item Change",
  reject_item_change: "Reject Item Change",
  "stock_count.submit": "Count Submitted",
  "stock_count.upsert": "Count Re-submitted",
  "stock_count.approve": "Count Approved",
  "stock_count.reject": "Count Rejected",
  "stock_count.bulk_approve": "Count Bulk Approved",
  "stock_count.approve_on_close": "Count Auto-approved (session close)",
  "count_session.close": "Session Closed",
  "variance.resolve": "Variance Resolved",
  "variance.bulk_resolve": "Variance Bulk Resolved",
};

function DiffView({ details }) {
  if (!details || typeof details !== "object") return null;
  const before = details.before;
  const after = details.after;
  if (!before && !after) {
    return (
      <Box component="pre" sx={{ fontSize: "0.75rem", bgcolor: "action.hover", p: 2, borderRadius: 1, overflow: "auto", m: 0 }}>
        {JSON.stringify(details, null, 2)}
      </Box>
    );
  }
  const keys = Array.from(new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]));
  const changed = keys.filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
  return (
    <Box>
      {details.reason && (
        <Typography variant="body2" sx={{ mb: 1 }}><b>Reason:</b> {details.reason}</Typography>
      )}
      <Box sx={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr", gap: 1, fontSize: "0.8rem" }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>Field</Typography>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>Before</Typography>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>After</Typography>
        {keys.flatMap((k) => {
          const isChanged = changed.includes(k);
          return [
            <span key={`${k}-name`} style={{ fontWeight: isChanged ? 600 : 400 }}>{k}</span>,
            <span key={`${k}-before`} style={{ color: isChanged ? "#d32f2f" : "inherit", fontFamily: "monospace" }}>
              {JSON.stringify(before?.[k] ?? null)}
            </span>,
            <span key={`${k}-after`} style={{ color: isChanged ? "#2e7d32" : "inherit", fontFamily: "monospace" }}>
              {JSON.stringify(after?.[k] ?? null)}
            </span>,
          ];
        })}
      </Box>
      {details.extra && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
          Extra: {JSON.stringify(details.extra)}
        </Typography>
      )}
    </Box>
  );
}

export default function AuditLogPage() {
  const notify = useNotify();
  const [records, setRecords] = useState([]);
  const [meta, setMeta] = useState({ count: 0, page: 1, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [filters, setFilters] = useState({ entity_type: "", user: "", from_date: "", to_date: "", page: 1 });

  useEffect(() => {
    setLoading(true);
    const params = { page: filters.page };
    if (filters.entity_type) params.entity_type = filters.entity_type;
    if (filters.user) params.user = filters.user;
    if (filters.from_date) params.from_date = filters.from_date;
    if (filters.to_date) params.to_date = filters.to_date;
    getAuditLog(params)
      .then((res) => {
        setRecords(res.data.results);
        setMeta({ count: res.data.count, page: res.data.page, total_pages: res.data.total_pages });
      })
      .catch(() => notify.error("Failed to load audit log."))
      .finally(() => setLoading(false));
  }, [filters]); // eslint-disable-line

  const setFilter = (key, value) => setFilters((p) => ({ ...p, [key]: value, page: 1 }));

  const columns = [
    {
      field: "created_at", headerName: "Timestamp", flex: 1, minWidth: 160,
      valueGetter: (v) => new Date(v).toLocaleString(),
    },
    { field: "username", headerName: "User", flex: 0.8, minWidth: 120 },
    {
      field: "action", headerName: "Action", flex: 1, minWidth: 160,
      valueGetter: (v) => ACTION_LABELS[v] ?? v,
    },
    {
      field: "entity", headerName: "Entity", flex: 0.9, minWidth: 140,
      valueGetter: (_, r) => `${r.entity_type} #${r.entity_id}`,
    },
    {
      field: "actions", headerName: "Details", width: 90, sortable: false, filterable: false,
      renderCell: (p) => (
        <IconButton size="small" onClick={(e) => {
          e.stopPropagation();
          setExpanded((prev) => ({ ...prev, [p.row.id]: !prev[p.row.id] }));
        }}>
          {expanded[p.row.id] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      ),
    },
  ];

  const expandedRecord = records.find((r) => expanded[r.id]);

  return (
    <Layout>
      <PageHeader
        title="Audit Log"
        subtitle={`${meta.count} records total`}
        icon={<ListAltIcon />}
      />

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Username…" value={filters.user} onChange={(e) => setFilter("user", e.target.value)} sx={{ flex: 1, minWidth: 160 }} />
        <TextField size="small" select value={filters.entity_type} onChange={(e) => setFilter("entity_type", e.target.value)} sx={{ minWidth: 180 }} label="Entity type">
          <MenuItem value="">All</MenuItem>
          <MenuItem value="upload_log">Upload Log</MenuItem>
          <MenuItem value="item">Item</MenuItem>
          <MenuItem value="pending_item">Pending Item</MenuItem>
        </TextField>
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={filters.from_date} onChange={(e) => setFilter("from_date", e.target.value)} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={filters.to_date} onChange={(e) => setFilter("to_date", e.target.value)} />
      </Stack>

      <DataTable
        rows={records}
        columns={columns}
        loading={loading}
        toolbar={false}
        height={560}
        paginationMode="server"
        rowCount={meta.count}
        paginationModel={{ page: meta.page - 1, pageSize: 20 }}
        onPaginationModelChange={(m) => setFilters((p) => ({ ...p, page: m.page + 1 }))}
        pageSizeOptions={[20]}
        emptyText="No audit records"
      />

      {expandedRecord && (
        <Card variant="outlined" sx={{ mt: 2 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">Details for record #{expandedRecord.id}</Typography>
              <IconButton size="small" onClick={() => setExpanded({})}><ExpandLessIcon /></IconButton>
            </Stack>
            <DiffView details={expandedRecord.details} />
          </CardContent>
        </Card>
      )}
    </Layout>
  );
}
