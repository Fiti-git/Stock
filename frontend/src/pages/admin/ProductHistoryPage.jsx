import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Stack, Chip, Typography, Box, Paper, Divider, Button, CircularProgress, Alert,
} from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { getItemHistory } from "../../api/items";

const EVENT_META = {
  created: { label: "Created", color: "default" },
  pos_snapshot: { label: "Daily Upload", color: "primary" },
  item_change: { label: "Field Change", color: "info" },
  audit: { label: "Audit", color: "secondary" },
  barcode: { label: "Barcode", color: "warning" },
  physical_count: { label: "Physical Count", color: "success" },
};

const ALL_TYPES = Object.keys(EVENT_META);

function describe(event) {
  const { event_type, payload } = event;
  if (event_type === "created") return `Item created in ${payload.outlet || "outlet"}`;
  if (event_type === "pos_snapshot") {
    const parts = [];
    parts.push(`qty ${payload.pos_quantity}`);
    if (payload.cost_price != null) parts.push(`cost ${payload.cost_price}`);
    if (payload.selling_price != null) parts.push(`sell ${payload.selling_price}`);
    const deltaKeys = Object.keys(payload.delta || {});
    if (deltaKeys.length > 0) parts.push(`(${deltaKeys.join(", ")} changed)`);
    return parts.join(" · ");
  }
  if (event_type === "item_change") {
    const fields = Object.keys(payload.changed_fields || {});
    const base = payload.change_type === "new_code" ? "New item code" : `Fields changed: ${fields.join(", ") || "—"}`;
    return `${base} · ${payload.status}`;
  }
  if (event_type === "audit") {
    const d = payload.details || {};
    const extras = [];
    if (d.barcode) extras.push(`barcode ${d.barcode}`);
    if (d.changes) extras.push(Object.keys(d.changes).join(", "));
    return `${payload.action}${extras.length ? " · " + extras.join(" · ") : ""}`;
  }
  if (event_type === "barcode") {
    return `${payload.barcode}${payload.is_primary ? " (primary)" : ""}`;
  }
  if (event_type === "physical_count") {
    return `qty ${payload.actual_qty}${payload.location_tag ? " @ " + payload.location_tag : ""}`;
  }
  return "";
}

export default function ProductHistoryPage() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTypes, setActiveTypes] = useState(new Set(ALL_TYPES));

  useEffect(() => {
    setLoading(true);
    getItemHistory(itemId)
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load history."))
      .finally(() => setLoading(false));
  }, [itemId]);

  const toggleType = (t) => {
    setActiveTypes((prev) => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t); else n.add(t);
      return n;
    });
  };

  const rows = useMemo(() => {
    if (!data) return [];
    return data.events
      .filter((e) => activeTypes.has(e.event_type))
      .map((e, i) => ({ id: i, ...e }));
  }, [data, activeTypes]);

  const columns = [
    {
      field: "ts", headerName: "When", width: 170,
      valueGetter: (v) => v ? new Date(v).toLocaleString() : "—",
    },
    {
      field: "event_type", headerName: "Event", width: 140,
      renderCell: (p) => {
        const m = EVENT_META[p.value] || { label: p.value, color: "default" };
        return <Chip size="small" label={m.label} color={m.color} variant="outlined" />;
      },
    },
    {
      field: "description", headerName: "Description", flex: 1.8, minWidth: 260,
      valueGetter: (_, row) => describe(row),
    },
    {
      field: "pos_qty", headerName: "POS Qty", width: 100,
      valueGetter: (_, row) => row.event_type === "pos_snapshot" ? row.payload.pos_quantity : (row.event_type === "physical_count" ? row.payload.actual_qty : ""),
    },
    {
      field: "cost", headerName: "Cost", width: 90,
      valueGetter: (_, row) => row.event_type === "pos_snapshot" && row.payload.cost_price != null ? Number(row.payload.cost_price).toFixed(2) : "",
    },
    {
      field: "selling", headerName: "Selling", width: 90,
      valueGetter: (_, row) => row.event_type === "pos_snapshot" && row.payload.selling_price != null ? Number(row.payload.selling_price).toFixed(2) : "",
    },
    { field: "user", headerName: "User", width: 130, valueGetter: (v) => v || "—" },
  ];

  return (
    <Layout>
      <PageHeader
        title="Product History"
        subtitle={data ? `${data.item_code} — ${data.item_name}` : "Complete timeline across uploads, edits, and counts"}
        icon={<HistoryIcon />}
        actions={
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>Back</Button>
        }
      />

      {loading && (
        <Box sx={{ display: "grid", placeItems: "center", py: 8 }}><CircularProgress size={24} /></Box>
      )}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {data && (
        <>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
              <Box>
                <Typography variant="caption" color="text.secondary">Outlet</Typography>
                <Typography variant="body2">{data.outlet_name || "—"}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Category</Typography>
                <Typography variant="body2">{data.category || "—"}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Primary Barcode</Typography>
                <Typography variant="body2" sx={{ fontFamily: "monospace" }}>{data.primary_barcode || "—"}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">All Barcodes</Typography>
                <Typography variant="body2" sx={{ fontFamily: "monospace" }}>{(data.barcodes || []).join(", ") || "—"}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Status</Typography>
                <Typography variant="body2">{data.status}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Created</Typography>
                <Typography variant="body2">{new Date(data.created_at).toLocaleString()}</Typography>
              </Box>
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", mr: 1 }}>Filter:</Typography>
              {ALL_TYPES.map((t) => {
                const m = EVENT_META[t];
                const on = activeTypes.has(t);
                return (
                  <Chip
                    key={t} size="small"
                    label={m.label}
                    color={on ? m.color : "default"}
                    variant={on ? "filled" : "outlined"}
                    onClick={() => toggleType(t)}
                  />
                );
              })}
            </Stack>
          </Paper>

          <DataTable
            rows={rows}
            columns={columns}
            loading={false}
            emptyText="No history events match the selected filters"
            height={560}
            initialPageSize={50}
            pageSizeOptions={[25, 50, 100]}
          />
        </>
      )}
    </Layout>
  );
}
