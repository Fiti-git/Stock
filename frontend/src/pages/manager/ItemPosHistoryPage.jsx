import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Card, CardContent, Typography, Stack, TextField, Autocomplete, Box,
  Alert, Chip, InputAdornment, CircularProgress,
} from "@mui/material";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import SearchIcon from "@mui/icons-material/Search";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { getItemPosHistory, searchCatalog } from "../../api/items";

export default function ItemPosHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedItem, setSelectedItem] = useState(null);
  const [history, setHistory] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef(null);

  const itemIdParam = searchParams.get("item");

  useEffect(() => {
    if (!itemIdParam) return;
    setLoading(true); setError(null);
    getItemPosHistory(itemIdParam, 1)
      .then(({ data }) => {
        setSelectedItem({ id: data.item_id, item_name: data.item_name, item_code: data.item_code });
        setHistory(data.history);
        setMeta({ count: data.count, page: data.page, page_size: data.page_size, total_pages: data.total_pages });
        setPage(1);
      })
      .catch(() => setError("Failed to load history."))
      .finally(() => setLoading(false));
  }, [itemIdParam]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!searchTerm.trim()) { setSearchResults([]); return; }
    timer.current = setTimeout(() => {
      setSearching(true);
      searchCatalog(searchTerm)
        .then(({ data }) => { const items = Array.isArray(data) ? data : data.results ?? []; setSearchResults(items.slice(0, 15)); })
        .catch(() => setSearchResults([])).finally(() => setSearching(false));
    }, 300);
  }, [searchTerm]);

  const loadPage = (itemId, p) => {
    setLoading(true); setError(null);
    getItemPosHistory(itemId, p).then(({ data }) => {
      setHistory(data.history);
      setMeta({ count: data.count, page: data.page, page_size: data.page_size, total_pages: data.total_pages });
      setPage(p);
    }).catch(() => setError("Failed to load history.")).finally(() => setLoading(false));
  };

  const handleSelect = (item) => {
    if (!item) return;
    setSelectedItem(item); setPage(1); setHistory([]); setMeta(null);
    setSearchParams({ item: item.id });
    loadPage(item.id, 1);
  };

  const columns = [
    {
      field: "snapshot_date", headerName: "Date", flex: 1, minWidth: 130,
      renderCell: (p) => {
        const hasChange = Object.keys(p.row.changed || {}).length > 0;
        return (
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" fontWeight={hasChange ? 600 : 400}>{p.value}</Typography>
            {hasChange && <Chip size="small" label="changed" color="warning" variant="outlined" />}
          </Stack>
        );
      },
    },
    {
      field: "pos_quantity", headerName: "POS Qty", type: "number", flex: 0.7, minWidth: 100,
      renderCell: (p) => <Box sx={{ bgcolor: p.row.changed?.pos_quantity ? "warning.light" : "transparent", px: 1, borderRadius: 0.5 }}>{p.value ?? "—"}</Box>,
    },
    {
      field: "selling_price", headerName: "Sell", type: "number", flex: 0.8, minWidth: 110,
      renderCell: (p) => <Box sx={{ bgcolor: p.row.changed?.selling_price ? "warning.light" : "transparent", px: 1, borderRadius: 0.5 }}>{p.value != null ? p.value.toFixed(2) : "—"}</Box>,
    },
    {
      field: "cost_price", headerName: "Cost", type: "number", flex: 0.8, minWidth: 110,
      renderCell: (p) => <Box sx={{ bgcolor: p.row.changed?.cost_price ? "warning.light" : "transparent", px: 1, borderRadius: 0.5 }}>{p.value != null ? p.value.toFixed(2) : "—"}</Box>,
    },
    { field: "uploaded_by", headerName: "Uploaded By", flex: 0.8, minWidth: 120, valueGetter: (v) => v ?? "—" },
    {
      field: "uploaded_at", headerName: "Uploaded At", flex: 1, minWidth: 150,
      valueGetter: (v) => v ? new Date(v).toLocaleString() : "—",
    },
  ];

  const changedCount = history.filter((r) => Object.keys(r.changed || {}).length > 0).length;

  return (
    <Layout>
      <PageHeader
        title="Product POS History"
        subtitle="Daily snapshot of POS Qty, Sell Price and Cost Price per item. Amber cells show values that changed from the previous day."
        icon={<QueryStatsIcon />}
      />

      <Autocomplete
        options={searchResults}
        getOptionLabel={(o) => o?.item_name || ""}
        onInputChange={(_, v) => setSearchTerm(v)}
        onChange={(_, v) => handleSelect(v)}
        loading={searching}
        filterOptions={(x) => x}
        sx={{ mb: 3, maxWidth: 600 }}
        renderOption={(props, option) => (
          <Box component="li" {...props}>
            <Typography variant="caption" color="text.secondary" sx={{ width: 100, fontFamily: "monospace" }}>{option.item_code}</Typography>
            <Typography variant="body2" sx={{ flex: 1 }} noWrap>{option.item_name}</Typography>
            {option.category && <Chip size="small" label={option.category} variant="outlined" />}
          </Box>
        )}
        renderInput={(params) => (
          <TextField {...params} size="small" placeholder="Search by item name, code or barcode…"
            InputProps={{
              ...(params.InputProps || {}),
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: (<>
                {searching ? <CircularProgress size={16} /> : null}
                {params.InputProps?.endAdornment}
              </>),
            }} />
        )}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {selectedItem && (
        <Card variant="outlined">
          <CardContent sx={{ pb: 1 }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems={{ md: "center" }}>
              <Box>
                <Typography variant="overline" color="text.secondary">Item Name</Typography>
                <Typography variant="subtitle1" fontWeight={600}>{selectedItem.item_name}</Typography>
              </Box>
              <Box>
                <Typography variant="overline" color="text.secondary">SKU / Code</Typography>
                <Typography variant="body2" sx={{ fontFamily: "monospace" }}>{selectedItem.item_code}</Typography>
              </Box>
              {meta && (
                <Box sx={{ ml: { md: "auto" }, textAlign: { md: "right" } }}>
                  <Typography variant="caption" color="text.secondary">{meta.count} days of data</Typography>
                  {changedCount > 0 && (
                    <Typography variant="caption" color="warning.main" sx={{ display: "block" }}>
                      {changedCount} row{changedCount !== 1 ? "s" : ""} changed on this page
                    </Typography>
                  )}
                </Box>
              )}
            </Stack>
          </CardContent>
          <Box sx={{ px: 2, pb: 2 }}>
            <DataTable
              rows={history}
              columns={columns}
              getRowId={(r) => r.snapshot_date}
              loading={loading}
              toolbar={false}
              paginationMode="server"
              rowCount={meta?.count ?? 0}
              paginationModel={{ page: page - 1, pageSize: meta?.page_size ?? 30 }}
              onPaginationModelChange={(m) => loadPage(selectedItem.id, m.page + 1)}
              pageSizeOptions={[meta?.page_size ?? 30]}
              height={560}
              emptyText="No snapshot history for this item"
            />
          </Box>
        </Card>
      )}
    </Layout>
  );
}
