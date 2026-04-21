import { useState, useEffect, useCallback } from "react";
import {
  Box, Grid, Paper, Stack, TextField, Button, IconButton, Chip, MenuItem,
  Typography, LinearProgress, Divider, Tooltip, List, ListItem, ListItemButton,
  ListItemText, Checkbox,
} from "@mui/material";
import AddLinkIcon from "@mui/icons-material/AddLink";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import RefreshIcon from "@mui/icons-material/Refresh";
import HubIcon from "@mui/icons-material/Hub";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import {
  getUnmappedItems, getMappingStats, suggestMasters,
  createItemLink, bulkCreateItemLinks, createMasterProduct,
} from "../../api/orgCatalog";
import { getOutlets } from "../../api/outlets";

const PAGE_SIZE = 25;
const HIGH_CONFIDENCE = 0.9;

export default function MasterMappingPage() {
  const notify = useNotify();
  const [stats, setStats] = useState(null);
  const [outlets, setOutlets] = useState([]);

  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [q, setQ] = useState("");
  const [outletId, setOutletId] = useState("");

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [activeItem, setActiveItem] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await getMappingStats();
      setStats(data);
    } catch { /* ignore */ }
  }, []);

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const { data } = await getUnmappedItems({
        q: q.trim() || undefined,
        outletId: outletId || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(data.items || []);
      setTotalPages(data.total_pages || 1);
      setTotalCount(data.count || 0);
      // Clear selections that scrolled off
      setSelectedIds((prev) => {
        const next = new Set();
        const ids = new Set((data.items || []).map((i) => i.id));
        prev.forEach((id) => ids.has(id) && next.add(id));
        return next;
      });
    } catch {
      notify.error("Failed to load unmapped items.");
    } finally {
      setLoadingItems(false);
    }
  }, [q, outletId, page, notify]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await getOutlets();
        setOutlets(Array.isArray(data) ? data : data.outlets || []);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q, outletId]);

  async function pickItem(item) {
    setActiveItem(item);
    setSuggestions([]);
    setLoadingSuggest(true);
    try {
      const { data } = await suggestMasters(item.id, 8);
      setSuggestions(data.suggestions || []);
    } catch {
      notify.error("Failed to fetch suggestions.");
    } finally {
      setLoadingSuggest(false);
    }
  }

  async function linkOne(masterId, confidence = null) {
    if (!activeItem) return;
    setSaving(true);
    try {
      await createItemLink({
        item_id: activeItem.id,
        master_product_id: masterId,
        confidence,
      });
      notify.success(`Linked ${activeItem.item_code}.`);
      setItems((list) => list.filter((i) => i.id !== activeItem.id));
      setTotalCount((c) => Math.max(0, c - 1));
      setActiveItem(null);
      setSuggestions([]);
      loadStats();
    } catch (err) {
      notify.error(err.response?.data?.detail || "Link failed.");
    } finally {
      setSaving(false);
    }
  }

  async function createMasterAndLink() {
    if (!activeItem) return;
    const code = prompt(
      "New Master Product code:",
      activeItem.item_code.toUpperCase()
    );
    if (!code || !code.trim()) return;
    setSaving(true);
    try {
      const { data: master } = await createMasterProduct({
        master_code: code.trim().toUpperCase(),
        name: activeItem.item_name,
        is_active: true,
      });
      await createItemLink({
        item_id: activeItem.id,
        master_product_id: master.id,
      });
      notify.success(`Created ${master.master_code} and linked ${activeItem.item_code}.`);
      setItems((list) => list.filter((i) => i.id !== activeItem.id));
      setTotalCount((c) => Math.max(0, c - 1));
      setActiveItem(null);
      setSuggestions([]);
      loadStats();
    } catch (err) {
      const data = err.response?.data;
      const msg = typeof data === "object" ? Object.values(data)[0] : null;
      notify.error(typeof msg === "string" ? msg : "Create + link failed.");
    } finally {
      setSaving(false);
    }
  }

  async function applyTopSuggestionBulk() {
    if (selectedIds.size === 0) return;
    const targets = items.filter((i) => selectedIds.has(i.id));
    setSaving(true);
    try {
      // Fetch suggestions in parallel and keep only high-confidence top hits.
      const results = await Promise.all(
        targets.map((i) =>
          suggestMasters(i.id, 1).then((r) => ({
            item: i,
            top: (r.data.suggestions || [])[0] || null,
          }))
        )
      );
      const goodLinks = results
        .filter(({ top }) => top && top.score >= HIGH_CONFIDENCE)
        .map(({ item, top }) => ({
          item_id: item.id,
          master_product_id: top.id,
          confidence: top.score,
        }));
      if (goodLinks.length === 0) {
        notify.info("No selected items had a high-confidence suggestion.");
        return;
      }
      const { data } = await bulkCreateItemLinks(goodLinks);
      notify.success(
        `Mapped ${data.created + data.updated} of ${targets.length} selected items.`
      );
      const linkedIds = new Set(goodLinks.map((l) => l.item_id));
      setItems((list) => list.filter((i) => !linkedIds.has(i.id)));
      setTotalCount((c) => Math.max(0, c - linkedIds.size));
      setSelectedIds(new Set());
      loadStats();
    } catch {
      notify.error("Bulk apply failed.");
    } finally {
      setSaving(false);
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((i) => i.id)));
  }

  return (
    <Layout>
      <PageHeader
        title="Master Mapping"
        subtitle="Link outlet items to canonical Master Products"
        icon={<HubIcon />}
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => { loadItems(); loadStats(); }}
          >
            Refresh
          </Button>
        }
      />

      {stats && (
        <Paper sx={{ p: 2, mb: 2 }} variant="outlined">
          <Stack direction={{ xs: "column", sm: "row" }} spacing={3} alignItems={{ sm: "center" }}>
            <Box sx={{ minWidth: 200 }}>
              <Typography variant="body2" color="text.secondary">Mapping coverage</Typography>
              <Typography variant="h5">{stats.mapped_pct}%</Typography>
              <Typography variant="caption" color="text.secondary">
                {stats.mapped_items.toLocaleString()} of {stats.total_items.toLocaleString()} items
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <LinearProgress
                variant="determinate"
                value={stats.mapped_pct}
                sx={{ height: 10, borderRadius: 1 }}
              />
            </Box>
          </Stack>
        </Paper>
      )}

      <Grid container spacing={2}>
        {/* LEFT — Unmapped items */}
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
              <TextField
                size="small"
                placeholder="Search code, name, barcode…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                fullWidth
              />
              <TextField
                select size="small" sx={{ minWidth: 160 }}
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                label="Outlet"
              >
                <MenuItem value="">All outlets</MenuItem>
                {outlets.map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>
                ))}
              </TextField>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Checkbox
                size="small"
                checked={items.length > 0 && selectedIds.size === items.length}
                indeterminate={selectedIds.size > 0 && selectedIds.size < items.length}
                onChange={toggleSelectAll}
              />
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                {totalCount.toLocaleString()} unmapped · page {page}/{totalPages}
              </Typography>
              <Button
                size="small"
                variant="contained"
                startIcon={<AutoAwesomeIcon />}
                disabled={selectedIds.size === 0 || saving}
                onClick={applyTopSuggestionBulk}
              >
                Apply top suggestion ({selectedIds.size})
              </Button>
            </Stack>
            {loadingItems && <LinearProgress />}
            <List dense sx={{ maxHeight: 600, overflow: "auto" }}>
              {items.map((i) => (
                <ListItem
                  key={i.id}
                  disableGutters
                  secondaryAction={
                    <Chip size="small" label={i.outlet_name || `Outlet ${i.outlet_id}`} />
                  }
                >
                  <Checkbox
                    size="small"
                    checked={selectedIds.has(i.id)}
                    onChange={() => toggleSelect(i.id)}
                  />
                  <ListItemButton
                    selected={activeItem?.id === i.id}
                    onClick={() => pickItem(i)}
                  >
                    <ListItemText
                      primary={`${i.item_code} — ${i.item_name}`}
                      secondary={i.barcode ? `Barcode: ${i.barcode}` : "No barcode"}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
              {!loadingItems && items.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
                  Nothing unmapped matches your filters.
                </Typography>
              )}
            </List>
            <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
              <Button
                size="small" disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >Prev</Button>
              <Button
                size="small" disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >Next</Button>
            </Stack>
          </Paper>
        </Grid>

        {/* RIGHT — Suggestions */}
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2, minHeight: 400 }}>
            {!activeItem && (
              <Typography color="text.secondary">
                Select an item on the left to see suggested masters.
              </Typography>
            )}
            {activeItem && (
              <Stack spacing={2}>
                <Box>
                  <Typography variant="overline" color="text.secondary">Linking</Typography>
                  <Typography variant="h6">
                    {activeItem.item_code} — {activeItem.item_name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {activeItem.outlet_name} · {activeItem.barcode ? `Barcode ${activeItem.barcode}` : "No barcode"}
                  </Typography>
                </Box>
                <Divider />
                {loadingSuggest && <LinearProgress />}
                {!loadingSuggest && suggestions.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No candidates found — create a new Master Product.
                  </Typography>
                )}
                {suggestions.map((s) => (
                  <Paper key={s.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2">
                          {s.master_code} — {s.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {[s.brand, s.pack_size, s.unit, s.category_name].filter(Boolean).join(" · ")}
                        </Typography>
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap">
                          <Chip
                            size="small"
                            color={s.score >= HIGH_CONFIDENCE ? "success" : "default"}
                            label={`score ${s.score}`}
                          />
                          {s.reasons.map((r, idx) => (
                            <Chip key={idx} size="small" variant="outlined" label={r} />
                          ))}
                        </Stack>
                      </Box>
                      <Tooltip title="Link to this master">
                        <span>
                          <IconButton
                            color="primary"
                            disabled={saving}
                            onClick={() => linkOne(s.id, s.score)}
                          >
                            <AddLinkIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </Paper>
                ))}
                <Divider />
                <Button
                  variant="outlined"
                  disabled={saving}
                  onClick={createMasterAndLink}
                >
                  Create new master from this item
                </Button>
              </Stack>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Layout>
  );
}
