import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Grid, Card, CardContent, Typography, TextField, Stack, Chip, Alert,
} from "@mui/material";
import GridViewIcon from "@mui/icons-material/GridView";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { getAllOutletsOverview } from "../../api/uploads";
import { useOutlet } from "../../contexts/OutletContext";

const todayStr = () => new Date().toLocaleDateString("en-CA");

export default function OutletsOverviewPage() {
  const navigate = useNavigate();
  const { setSelectedOutlet } = useOutlet();
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true); setError(null);
    getAllOutletsOverview(date)
      .then((r) => setData(r.data))
      .catch(() => setError("Failed to load overview."))
      .finally(() => setLoading(false));
  }, [date]);

  const goToHistory = (o) => {
    setSelectedOutlet({ id: o.outlet_id, name: o.outlet_name });
    navigate("/upload/history");
  };

  const columns = [
    {
      field: "outlet_name", headerName: "Outlet", flex: 1.2, minWidth: 160,
      renderCell: (p) => (
        <Stack>
          <Typography variant="body2" fontWeight={600}>{p.value}</Typography>
          <Typography variant="caption" color="text.secondary">{p.row.short_code}</Typography>
        </Stack>
      ),
    },
    {
      field: "uploaded", headerName: "Status", flex: 1, minWidth: 180,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          {p.value
            ? <Chip size="small" icon={<CheckCircleIcon />} label="Uploaded" color="success" variant="outlined" />
            : <Chip size="small" icon={<CancelIcon />} label="Missing" color="error" variant="outlined" />}
          {p.row.approval_status === "pending" && <Chip size="small" label="Pending" color="warning" variant="outlined" />}
        </Stack>
      ),
    },
    { field: "uploaded_by", headerName: "Uploaded By", flex: 0.9, minWidth: 130, valueGetter: (v) => v ?? "—" },
    {
      field: "uploaded_at", headerName: "Time", flex: 0.7, minWidth: 110,
      valueGetter: (v) => v ? new Date(v).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—",
    },
    { field: "total_rows", headerName: "Rows", type: "number", flex: 0.5, minWidth: 90, valueGetter: (v) => v ?? "—" },
  ];

  return (
    <Layout>
      <PageHeader
        title="Outlets Overview"
        subtitle="Daily upload status across all outlets"
        icon={<GridViewIcon />}
        actions={
          <TextField size="small" type="date" label="Date" InputLabelProps={{ shrink: true }}
            value={date} inputProps={{ max: todayStr() }} onChange={(e) => setDate(e.target.value)} />
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {data && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: "Total Outlets", value: data.total_outlets, color: "text.primary" },
            { label: "Uploaded", value: data.uploaded_count, color: "success.main" },
            { label: "Missing", value: data.missing_count, color: "error.main" },
          ].map((c) => (
            <Grid key={c.label} item xs={4}>
              <Card variant="outlined"><CardContent sx={{ textAlign: "center" }}>
                <Typography variant="h2" sx={{ color: c.color }}>{c.value}</Typography>
                <Typography variant="caption" color="text.secondary">{c.label}</Typography>
              </CardContent></Card>
            </Grid>
          ))}
        </Grid>
      )}

      <DataTable
        rows={data?.outlets ?? []}
        columns={columns}
        getRowId={(r) => r.outlet_id}
        loading={loading}
        onRowClick={(p) => goToHistory(p.row)}
        sx={{ "& .MuiDataGrid-row": { cursor: "pointer" } }}
        emptyText="No outlets"
      />
    </Layout>
  );
}
