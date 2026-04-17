import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Box, Card, CardContent, Stack, TextField, Typography, LinearProgress,
  ToggleButton, ToggleButtonGroup, FormControlLabel, Checkbox, Button, Alert,
  Chip, Fab, Pagination, InputAdornment,
} from "@mui/material";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import SearchIcon from "@mui/icons-material/Search";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import EditIcon from "@mui/icons-material/Edit";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { getCountItems, submitCount } from "../../api/dashboard";
import { useOutlet } from "../../contexts/OutletContext";

export default function StockCountPage() {
  const notify = useNotify();
  const { outletId } = useOutlet();
  const todayISO = new Date().toLocaleDateString("en-CA");

  const [countDate, setCountDate] = useState(todayISO);
  const [items, setItems] = useState([]);
  const [noUpload, setNoUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState(null);
  const [inputs, setInputs] = useState({});
  const [recount, setRecount] = useState({});
  const [isMonthEnd, setIsMonthEnd] = useState(false);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [countedItems, setCountedItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const inputRefs = useRef({});

  useEffect(() => {
    setLoading(true); setItems([]); setNoUpload(false);
    getCountItems(outletId, countDate, page)
      .then((res) => {
        if (res.data?.no_upload) setNoUpload(true);
        else if (res.data?.results) {
          setItems(res.data.results);
          setTotalItems(res.data.count || 0);
          setCountedItems(res.data.counted_count || 0);
          setTotalPages(res.data.total_pages || 1);
        } else setItems(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => notify.error("Failed to load items. Check POS upload exists."))
      .finally(() => setLoading(false));
  }, [outletId, countDate, page]); // eslint-disable-line

  const setInput = (id, field, value) => setInputs((p) => ({ ...p, [id]: { ...(p[id] || { qty: "", location_tag: "" }), [field]: value } }));

  const handleSave = useCallback(async (itemId) => {
    const input = inputs[itemId] || {};
    const qty = input.qty;
    if (qty === "" || qty === undefined || isNaN(Number(qty))) return;
    setSaving(itemId);
    try {
      const res = await submitCount(itemId, Number(qty), input.location_tag || "", isMonthEnd, countDate);
      const count = res.data;
      setItems((prev) => prev.map((item) => {
        if (item.item_id !== itemId) return item;
        if (item.today_actual_qty === null) setCountedItems((c) => c + 1);
        return { ...item, today_count_id: count.id, today_actual_qty: Number(qty), today_location_tag: input.location_tag || "", today_counted_by: count.counted_by || null };
      }));
      setInputs((p) => { const n = { ...p }; delete n[itemId]; return n; });
      setRecount((p) => { const n = { ...p }; delete n[itemId]; return n; });
      const nextUncounted = items.find((it) => it.item_id !== itemId && it.today_actual_qty === null);
      if (nextUncounted && inputRefs.current[nextUncounted.item_id]) {
        setTimeout(() => inputRefs.current[nextUncounted.item_id]?.focus(), 50);
      }
    } catch { notify.error("Failed to save count."); }
    finally { setSaving(null); }
  }, [inputs, items, isMonthEnd, countDate]); // eslint-disable-line

  const startRecount = (item) => {
    setRecount((p) => ({ ...p, [item.item_id]: true }));
    setInputs((p) => ({ ...p, [item.item_id]: { qty: item.today_actual_qty !== null ? String(item.today_actual_qty) : "", location_tag: item.today_location_tag || "" } }));
    setTimeout(() => inputRefs.current[item.item_id]?.focus(), 50);
  };

  const jumpToNextUncounted = () => {
    const next = items.find((it) => it.today_actual_qty === null && !recount[it.item_id]);
    if (next && inputRefs.current[next.item_id]) {
      inputRefs.current[next.item_id].scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => inputRefs.current[next.item_id]?.focus(), 150);
    }
  };

  const filtered = items
    .filter((item) => !search || item.item_code.toLowerCase().includes(search.toLowerCase()) || item.item_name.toLowerCase().includes(search.toLowerCase()) || (item.barcode || "").toLowerCase().includes(search.toLowerCase()))
    .filter((item) => filter === "all" || (filter === "uncounted" ? item.today_actual_qty === null : item.today_actual_qty !== null));

  const pct = totalItems > 0 ? Math.round((countedItems / totalItems) * 100) : 0;
  const hasUncounted = items.some((i) => i.today_actual_qty === null);

  return (
    <Layout>
      <PageHeader
        title="Stock Count"
        subtitle={`${countedItems} of ${totalItems} items counted · ${pct}%`}
        icon={<QrCodeScannerIcon />}
        actions={
          <TextField size="small" type="date" label="Count Date" InputLabelProps={{ shrink: true }}
            value={countDate} inputProps={{ max: todayISO }}
            onChange={(e) => { setCountDate(e.target.value); setSearch(""); setFilter("all"); setInputs({}); setRecount({}); setPage(1); }} />
        }
      />

      {totalItems > 0 && <LinearProgress variant="determinate" value={pct} color={pct === 100 ? "success" : "primary"} sx={{ mb: 2 }} />}

      <FormControlLabel sx={{ mb: 2 }}
        control={<Checkbox checked={isMonthEnd} onChange={(e) => setIsMonthEnd(e.target.checked)} />}
        label={<Typography variant="body2">Month-End Count {isMonthEnd && <Chip size="small" label="active" color="primary" sx={{ ml: 1 }} />}</Typography>}
      />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" fullWidth placeholder="Search by code, name, or barcode…" value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <ToggleButtonGroup exclusive size="small" value={filter} onChange={(_, v) => v && setFilter(v)}>
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="uncounted">Uncounted</ToggleButton>
          <ToggleButton value="counted">Counted</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {loading && <Alert severity="info">Loading items…</Alert>}
      {noUpload && <Alert severity="warning">No POS upload found for <b>{countDate}</b>. Ask the manager to upload the XLS for this date.</Alert>}
      {!loading && !noUpload && items.length === 0 && <Alert severity="info">No items. Upload a POS snapshot first.</Alert>}
      {!loading && items.length > 0 && filtered.length === 0 && <Alert severity="info">No items match your search.</Alert>}

      <Stack spacing={1.5} sx={{ pb: 8 }}>
        {filtered.map((item) => {
          const isCounted = item.today_actual_qty !== null && !recount[item.item_id];
          const isSaving = saving === item.item_id;
          const input = inputs[item.item_id] || { qty: "", location_tag: "" };
          return (
            <Card key={item.item_id} variant="outlined" sx={{ borderColor: isCounted ? "success.main" : "divider" }}>
              <CardContent>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1} sx={{ mb: 1.5 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Link to={`/items/${item.item_id}`} style={{ color: "inherit", textDecoration: "none" }}>
                      <Typography variant="subtitle2" fontWeight={600}>{item.item_name}</Typography>
                    </Link>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: "wrap" }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>{item.item_code}</Typography>
                      {item.category && <Typography variant="caption" color="text.secondary">{item.category}</Typography>}
                      {item.barcode && <Typography variant="caption" color="text.secondary">Barcode: {item.barcode}</Typography>}
                    </Stack>
                  </Box>
                  <Box sx={{ textAlign: { sm: "right" } }}>
                    <Typography variant="caption" color="text.secondary">POS qty</Typography>
                    <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 500 }}>{item.pos_qty}</Typography>
                  </Box>
                </Stack>

                {isCounted ? (
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="body2" color="success.main" fontWeight={600} component="span">Counted: {item.today_actual_qty}</Typography>
                      {item.today_location_tag && <Typography variant="body2" component="span" sx={{ ml: 1, color: "text.secondary" }}>@ {item.today_location_tag}</Typography>}
                      {item.today_counted_by && <Typography variant="caption" sx={{ ml: 1, color: "text.secondary" }}>by {item.today_counted_by}</Typography>}
                    </Box>
                    <Button size="small" startIcon={<EditIcon />} onClick={() => startRecount(item)}>Re-count</Button>
                  </Stack>
                ) : (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "flex-end" }}>
                    <TextField inputRef={(el) => (inputRefs.current[item.item_id] = el)} size="small" fullWidth type="number"
                      label="Actual Qty *" inputProps={{ step: "0.001", min: 0, inputMode: "decimal" }}
                      placeholder="0.000" value={input.qty}
                      onChange={(e) => setInput(item.item_id, "qty", e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSave(item.item_id)} disabled={isSaving} />
                    <TextField size="small" fullWidth label="Location" placeholder="e.g. Shelf A3" value={input.location_tag}
                      onChange={(e) => setInput(item.item_id, "location_tag", e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSave(item.item_id)} disabled={isSaving} />
                    <Button variant="contained" onClick={() => handleSave(item.item_id)} disabled={isSaving || input.qty === ""} sx={{ minWidth: 100 }}>
                      {isSaving ? "Saving…" : "Save"}
                    </Button>
                  </Stack>
                )}
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      {totalPages > 1 && !loading && !noUpload && (
        <Stack alignItems="center" sx={{ mt: 3 }}>
          <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} color="primary" />
        </Stack>
      )}

      {hasUncounted && !loading && (
        <Fab color="primary" onClick={jumpToNextUncounted} sx={{ position: "fixed", bottom: 20, right: 20, display: { md: "none" } }}>
          <KeyboardArrowDownIcon />
        </Fab>
      )}
    </Layout>
  );
}
