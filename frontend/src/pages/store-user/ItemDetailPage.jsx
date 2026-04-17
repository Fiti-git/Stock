import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Card, CardContent, Typography, Stack, Chip, Grid, Button, Alert, CircularProgress,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { getItemDetail } from "../../api/items";

function VarianceText({ v }) {
  if (v === null || v === undefined) return <Typography component="span" sx={{ opacity: 0.4 }}>—</Typography>;
  if (v < 0) return <Typography component="span" color="error.main" fontWeight={600}>{v}</Typography>;
  if (v > 0) return <Typography component="span" color="success.main" fontWeight={600}>+{v}</Typography>;
  return <Typography component="span">0</Typography>;
}

export default function ItemDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getItemDetail(id).then((res) => setItem(res.data)).catch(() => setError("Item not found or you do not have access.")).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Layout><Box sx={{ display: "grid", placeItems: "center", py: 8 }}><CircularProgress /></Box></Layout>;
  if (error || !item) return <Layout><Alert severity="error">{error || "Item not found."}</Alert></Layout>;

  const posCols = [
    { field: "snapshot_date", headerName: "Date", flex: 0.9, minWidth: 110 },
    {
      field: "pos_quantity", headerName: "Qty", type: "number", flex: 0.6, minWidth: 80,
      renderCell: (p) => <Box sx={{ color: p.value < 0 ? "error.main" : "text.primary", fontWeight: p.value < 0 ? 600 : 400 }}>{p.value}</Box>,
    },
    { field: "cost_price", headerName: "Cost", flex: 0.6, minWidth: 80, valueGetter: (v) => v ?? "—" },
    { field: "selling_price", headerName: "Price", flex: 0.6, minWidth: 80, valueGetter: (v) => v ?? "—" },
    { field: "uploaded_by_username", headerName: "By", flex: 0.8, minWidth: 100, valueGetter: (v) => v || "—" },
  ];

  const countCols = [
    { field: "count_date", headerName: "Date", flex: 0.9, minWidth: 110 },
    { field: "actual_qty", headerName: "Qty", type: "number", flex: 0.6, minWidth: 80 },
    { field: "location_tag", headerName: "Location", flex: 0.8, minWidth: 110, valueGetter: (v) => v || "—" },
    { field: "counted_by_username", headerName: "By", flex: 0.8, minWidth: 100, valueGetter: (v) => v || "—" },
    {
      field: "is_month_end", headerName: "M/E", flex: 0.4, minWidth: 60,
      renderCell: (p) => p.value ? <Chip size="small" label="✓" color="info" variant="outlined" /> : "",
    },
  ];

  return (
    <Layout>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>Back</Button>

      <PageHeader
        title={item.item_name}
        subtitle={
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
            <Chip size="small" variant="outlined" label={item.item_code} sx={{ fontFamily: "monospace" }} />
            {item.barcode && <Chip size="small" variant="outlined" label={`Barcode: ${item.barcode}`} />}
            {item.category && <Chip size="small" variant="outlined" label={item.category} />}
            <Chip size="small" variant="outlined" label={item.outlet_name} />
            <Chip size="small" color={item.status === "active" ? "success" : "warning"} label={item.status === "pending_barcode" ? "Pending Barcode" : "Active"} />
          </Stack>
        }
        icon={<Inventory2Icon />}
      />

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Typography variant="overline" color="text.secondary">Latest POS Qty</Typography>
              <Typography variant="h3" sx={{ fontFamily: "monospace" }}>{item.latest_pos_qty ?? "—"}</Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="overline" color="text.secondary">Latest Actual Qty</Typography>
              <Typography variant="h3" sx={{ fontFamily: "monospace" }}>{item.latest_actual_qty ?? "—"}</Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="overline" color="text.secondary">Variance</Typography>
              <Typography variant="h3" sx={{ fontFamily: "monospace" }}>
                <VarianceText v={item.variance} />
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="h4">POS Snapshot History</Typography>
              <Typography variant="caption" color="text.secondary">Last 30 uploads</Typography>
            </CardContent>
            <Box sx={{ px: 2, pb: 2 }}>
              <DataTable rows={item.pos_history} columns={posCols} toolbar={false} height={400} initialPageSize={10} emptyText="No snapshots yet" />
            </Box>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="h4">Physical Count History</Typography>
              <Typography variant="caption" color="text.secondary">Last 30 counts</Typography>
            </CardContent>
            <Box sx={{ px: 2, pb: 2 }}>
              <DataTable rows={item.count_history} columns={countCols} toolbar={false} height={400} initialPageSize={10} emptyText="No counts recorded" />
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
}
