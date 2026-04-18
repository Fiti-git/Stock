import { useEffect, useMemo, useRef, useState } from "react";
import {
  Stack, TextField, MenuItem, IconButton, Tooltip, Chip, InputAdornment, Typography, Box, Button, Alert,
} from "@mui/material";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import AddIcon from "@mui/icons-material/Add";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, FormDialog } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { useAuth } from "../../contexts/AuthContext";
import { useOutlet } from "../../contexts/OutletContext";
import { getOutlets } from "../../api/outlets";
import {
  listOutletBarcodes,
  createOutletBarcode,
  deleteItemBarcode,
  setPrimaryBarcode,
  searchCatalog,
} from "../../api/items";

export default function BarcodeMasterPage() {
  const notify = useNotify();
  const { user } = useAuth();
  const { selectedOutlet, setSelectedOutlet } = useOutlet();
  const isAdmin = user?.role === "admin";

  const [outlets, setOutlets] = useState([]);
  // Managers are locked to their own outlet; admins can pick any.
  const [outletId, setOutletId] = useState(
    isAdmin ? (selectedOutlet?.id || "") : (user?.outlet_id || "")
  );

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const searchTimer = useRef(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addItemQuery, setAddItemQuery] = useState("");
  const [addItemOptions, setAddItemOptions] = useState([]);
  const [addItem, setAddItem] = useState(null);
  const [addBarcode, setAddBarcode] = useState("");
  const [addMakePrimary, setAddMakePrimary] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const PAGE_SIZE = 50;

  useEffect(() => {
    if (isAdmin) {
      getOutlets().then(({ data }) => setOutlets(Array.isArray(data) ? data : []));
    } else if (user?.outlet_id) {
      setOutlets([{ id: user.outlet_id, outlet_name: user.outlet_name || "My outlet" }]);
    }
  }, [isAdmin, user?.outlet_id, user?.outlet_name]);

  useEffect(() => {
    if (!isAdmin) return;
    if (selectedOutlet?.id && !outletId) setOutletId(selectedOutlet.id);
  }, [isAdmin, selectedOutlet, outletId]);

  const fetchBarcodes = (p = 1, q = "") => {
    if (!outletId) return;
    setLoading(true);
    listOutletBarcodes(outletId, { page: p, pageSize: PAGE_SIZE, q })
      .then(({ data }) => {
        setRows(data.results || []);
        setTotalCount(data.count || 0);
      })
      .catch(() => {
        setRows([]);
        setTotalCount(0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (outletId) {
      setPage(1);
      fetchBarcodes(1, search);
    } else {
      setRows([]);
      setTotalCount(0);
    }
    // eslint-disable-next-line
  }, [outletId]);

  useEffect(() => {
    if (!outletId) return;
    fetchBarcodes(page, search);
    // eslint-disable-next-line
  }, [page]);

  const onSearchChange = (e) => {
    const v = e.target.value;
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchBarcodes(1, v);
    }, 300);
  };

  const onOutletChange = (e) => {
    const id = e.target.value;
    setOutletId(id);
    const o = outlets.find((x) => x.id === id);
    if (o) setSelectedOutlet({ id: o.id, outlet_name: o.outlet_name });
  };

  const handleDelete = async (row) => {
    try {
      await deleteItemBarcode(row.item_id, row.id);
      notify.success("Barcode removed.");
      fetchBarcodes(page, search);
    } catch (err) {
      notify.error(err.response?.data?.detail || "Failed to delete barcode.");
    }
  };

  const handleSetPrimary = async (row) => {
    try {
      await setPrimaryBarcode(row.item_id, row.id);
      notify.success("Primary barcode updated.");
      fetchBarcodes(page, search);
    } catch (err) {
      notify.error(err.response?.data?.detail || "Failed to set primary.");
    }
  };

  // Item picker for the Add dialog
  useEffect(() => {
    if (!addOpen || !outletId) return;
    const q = addItemQuery.trim();
    if (q.length < 2) {
      setAddItemOptions([]);
      return;
    }
    const t = setTimeout(() => {
      searchCatalog(q, outletId)
        .then(({ data }) => setAddItemOptions(data.results || []))
        .catch(() => setAddItemOptions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [addItemQuery, addOpen, outletId]);

  const resetAddForm = () => {
    setAddItemQuery("");
    setAddItemOptions([]);
    setAddItem(null);
    setAddBarcode("");
    setAddMakePrimary(false);
    setAddError("");
  };

  const handleAddBarcode = async () => {
    if (!addItem || !addBarcode.trim()) return;
    setAddSaving(true);
    setAddError("");
    try {
      await createOutletBarcode(outletId, {
        item_id: addItem.id,
        barcode: addBarcode.trim(),
        is_primary: addMakePrimary,
      });
      notify.success("Barcode added.");
      setAddOpen(false);
      resetAddForm();
      fetchBarcodes(page, search);
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      if (status === 409 && data?.conflict) {
        setAddError(
          `Barcode "${addBarcode.trim()}" is already assigned in this outlet to ${data.conflict.item_code} — ${data.conflict.item_name}.`
        );
      } else {
        setAddError(data?.detail || "Failed to add barcode.");
      }
    } finally {
      setAddSaving(false);
    }
  };

  const columns = useMemo(() => [
    {
      field: "barcode", headerName: "Barcode", flex: 1, minWidth: 160,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ fontFamily: "monospace" }}>{p.value}</Typography>
      ),
    },
    { field: "item_code", headerName: "Item Code", flex: 0.7, minWidth: 110 },
    { field: "item_name", headerName: "Item Name", flex: 1.6, minWidth: 220 },
    {
      field: "is_primary", headerName: "Primary", width: 100, sortable: false,
      renderCell: (p) => p.value
        ? <Chip size="small" label="Primary" color="warning" variant="outlined" icon={<StarIcon fontSize="small" />} />
        : <Chip size="small" label="—" variant="outlined" />,
    },
    {
      field: "assigned_at", headerName: "Assigned", width: 170,
      valueGetter: (v) => v ? new Date(v).toLocaleString() : "—",
    },
    { field: "assigned_by_username", headerName: "By", width: 120, valueGetter: (v) => v || "—" },
    {
      field: "actions", headerName: "", width: 120, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          {!p.row.is_primary && (
            <Tooltip title="Set as primary">
              <IconButton size="small" onClick={() => handleSetPrimary(p.row)}>
                <StarBorderIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Delete">
            <IconButton size="small" onClick={() => handleDelete(p.row)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
    // eslint-disable-next-line
  ], [page, search, outletId]);

  const selectedOutletName = outlets.find((o) => o.id === outletId)?.outlet_name;

  return (
    <Layout>
      <PageHeader
        title="Barcode Master"
        subtitle="Outlet-scoped barcode management. Barcodes are unique within each outlet."
        icon={<QrCodeScannerIcon />}
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              size="small" select label="Outlet" value={outletId} onChange={onOutletChange}
              disabled={!isAdmin}
              sx={{ minWidth: 220 }}
            >
              {isAdmin && <MenuItem value=""><em>Select an outlet…</em></MenuItem>}
              {outlets.map((o) => (
                <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained" size="small" startIcon={<AddIcon />}
              disabled={!outletId}
              onClick={() => { resetAddForm(); setAddOpen(true); }}
            >
              Add barcode
            </Button>
          </Stack>
        }
      />

      {!outletId ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          Select an outlet above to view and manage its barcodes.
        </Alert>
      ) : (
        <>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <TextField
              fullWidth size="small"
              placeholder="Search barcode, item code, or item name…"
              value={search} onChange={onSearchChange}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
            {totalCount > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                {totalCount} barcode{totalCount === 1 ? "" : "s"} in {selectedOutletName}
              </Typography>
            )}
          </Stack>

          <DataTable
            rows={rows}
            columns={columns}
            loading={loading}
            paginationMode="server"
            rowCount={totalCount}
            paginationModel={{ page: page - 1, pageSize: PAGE_SIZE }}
            onPaginationModelChange={(m) => setPage(m.page + 1)}
            pageSizeOptions={[PAGE_SIZE]}
            emptyText="No barcodes in this outlet"
            height={640}
          />
        </>
      )}

      <FormDialog
        open={addOpen}
        onClose={() => { setAddOpen(false); resetAddForm(); }}
        onSubmit={handleAddBarcode}
        title={`Add barcode — ${selectedOutletName || ""}`}
        loading={addSaving}
        disableSubmit={!addItem || !addBarcode.trim()}
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Search item by code or name"
            size="small" fullWidth autoFocus
            value={addItemQuery}
            onChange={(e) => { setAddItemQuery(e.target.value); setAddItem(null); }}
          />
          {addItemQuery.trim().length >= 2 && addItemOptions.length > 0 && !addItem && (
            <Box sx={{ maxHeight: 180, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
              {addItemOptions.map((opt) => (
                <Box
                  key={opt.id}
                  onClick={() => { setAddItem(opt); setAddItemQuery(`${opt.item_code} — ${opt.item_name}`); }}
                  sx={{ px: 1.5, py: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
                >
                  <Typography variant="body2"><b>{opt.item_code}</b> — {opt.item_name}</Typography>
                </Box>
              ))}
            </Box>
          )}
          {addItem && (
            <Alert severity="success" variant="outlined">
              Selected: <b>{addItem.item_code}</b> — {addItem.item_name}
            </Alert>
          )}
          <TextField
            label="Barcode" size="small" fullWidth
            value={addBarcode}
            onChange={(e) => setAddBarcode(e.target.value)}
            InputProps={{ sx: { fontFamily: "monospace" } }}
          />
          <Stack direction="row" alignItems="center" spacing={1}>
            <input
              type="checkbox"
              id="make-primary"
              checked={addMakePrimary}
              onChange={(e) => setAddMakePrimary(e.target.checked)}
            />
            <label htmlFor="make-primary">
              <Typography variant="body2">Set as primary barcode for this item</Typography>
            </label>
          </Stack>
          {addError && <Alert severity="error">{addError}</Alert>}
        </Stack>
      </FormDialog>
    </Layout>
  );
}
