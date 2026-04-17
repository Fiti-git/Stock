import { useState, useEffect, useRef } from "react";
import {
  Card, CardContent, Typography, Stack, TextField, MenuItem, Chip, Box, Alert,
  Collapse, IconButton, InputAdornment,
} from "@mui/material";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import SearchIcon from "@mui/icons-material/Search";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { useOutlet } from "../../contexts/OutletContext";
import { getCatalog, getItemPriceHistory } from "../../api/catalog";

function PriceHistoryPanel({ itemId, itemName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true); setError("");
    getItemPriceHistory(itemId).then(({ data }) => setData(data)).catch(() => setError("Could not load history.")).finally(() => setLoading(false));
  }, [itemId]);

  const cols = [
    { field: "snapshot_date", headerName: "Date", flex: 1, minWidth: 120 },
    { field: "selling_price", headerName: "Sell Price", flex: 1, minWidth: 120, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "cost_price", headerName: "Cost Price", flex: 1, minWidth: 120, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "pos_quantity", headerName: "POS Qty", flex: 0.8, minWidth: 100, type: "number" },
  ];

  return (
    <Box sx={{ p: 2, bgcolor: "action.hover" }}>
      <Typography variant="subtitle2" gutterBottom>Price History — {itemName}</Typography>
      {loading && <Typography variant="caption" color="text.secondary">Loading…</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      {data && (data.history.length === 0
        ? <Typography variant="caption" color="text.secondary">No snapshot history available.</Typography>
        : <DataTable rows={data.history} columns={cols} getRowId={(r) => r.snapshot_date} toolbar={false} height={280} initialPageSize={10} />
      )}
    </Box>
  );
}

export default function CatalogPage() {
  const { selectedOutlet } = useOutlet();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [categories, setCategories] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const debounceRef = useRef(null);

  const load = (q, cat, pg, outletId) => {
    setLoading(true); setError("");
    const params = { page: pg };
    if (q) params.q = q;
    if (cat) params.category = cat;
    if (outletId) params.outlet = outletId;
    getCatalog(params).then(({ data }) => {
      setItems(data.results); setTotalPages(data.total_pages); setTotalCount(data.count);
      if (pg === 1) setCategories([...new Set(data.results.map((i) => i.category).filter(Boolean))].sort());
    }).catch(() => setError("Failed to load catalog.")).finally(() => setLoading(false));
  };

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); load(search, category, 1, selectedOutlet?.id); }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, category, selectedOutlet?.id]); // eslint-disable-line

  useEffect(() => { load(search, category, page, selectedOutlet?.id); }, [page]); // eslint-disable-line

  const columns = [
    { field: "item_name", headerName: "Item Name", flex: 1.4, minWidth: 200 },
    { field: "item_code", headerName: "SKU / Code", flex: 0.8, minWidth: 120 },
    { field: "barcode", headerName: "Barcode", flex: 0.9, minWidth: 130, valueGetter: (v) => v || "—" },
    { field: "category", headerName: "Category", flex: 0.8, minWidth: 120, valueGetter: (v) => v || "—" },
    { field: "latest_selling_price", headerName: "Sell Price", type: "number", flex: 0.7, minWidth: 110, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "latest_cost_price", headerName: "Cost Price", type: "number", flex: 0.7, minWidth: 110, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "latest_snapshot_date", headerName: "Last Updated", flex: 0.9, minWidth: 130, valueGetter: (v) => v || "—" },
    {
      field: "status", headerName: "Status", flex: 0.8, minWidth: 130,
      renderCell: (p) => p.value === "active"
        ? <Chip size="small" label="Active" color="success" variant="outlined" />
        : <Chip size="small" label="Pending Barcode" color="warning" variant="outlined" />,
    },
    {
      field: "expand", headerName: "", width: 60, sortable: false, filterable: false,
      renderCell: (p) => (
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === p.row.id ? null : p.row.id); }}>
          {expandedId === p.row.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      ),
    },
  ];

  const expandedItem = items.find((i) => i.id === expandedId);

  return (
    <Layout>
      <PageHeader
        title="Product Catalog"
        subtitle={`Browse products, prices, and upload history from POS data${totalCount > 0 ? ` · ${totalCount.toLocaleString()} items` : ""}`}
        icon={<Inventory2Icon />}
      />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" fullWidth placeholder="Search by name, SKU, or barcode…" value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <TextField size="small" select label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} sx={{ minWidth: 180 }}>
          <MenuItem value="">All categories</MenuItem>
          {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <DataTable
        rows={items}
        columns={columns}
        loading={loading}
        paginationMode="server"
        rowCount={totalCount}
        paginationModel={{ page: page - 1, pageSize: 25 }}
        onPaginationModelChange={(m) => setPage(m.page + 1)}
        pageSizeOptions={[25]}
        toolbar={false}
        height={640}
        emptyText="No products found"
      />

      {expandedItem && (
        <Card variant="outlined" sx={{ mt: 2 }}>
          <PriceHistoryPanel itemId={expandedItem.id} itemName={expandedItem.item_name} />
        </Card>
      )}
    </Layout>
  );
}
