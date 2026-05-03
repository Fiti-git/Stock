import { useEffect, useMemo, useState } from "react";
import {
  Stack, TextField, MenuItem, Chip, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, Typography, Alert, Box, Switch, FormControlLabel, IconButton, Grid,
} from "@mui/material";
import CollectionsIcon from "@mui/icons-material/Collections";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import Layout from "../../../components/Layout";
import { PageHeader, DataTable } from "../../../components/ui";
import {
  listEcomProducts, getEcomProduct, upsertEcomDescription,
  uploadEcomImage, deleteEcomImage,
} from "../../../api/ecom";

function ProductDialog({ itemId, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);

  const load = () => {
    getEcomProduct(itemId).then(({ data }) => {
      setData(data);
      setForm({
        slug: data.description?.slug || "",
        short_description: data.description?.short_description || "",
        long_description: data.description?.long_description || "",
        seo_title: data.description?.seo_title || "",
        seo_description: data.description?.seo_description || "",
        is_published: !!data.description?.is_published,
      });
    }).catch(() => setError("Could not load product."));
  };
  useEffect(load, [itemId]);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await upsertEcomDescription(itemId, form);
      onSaved?.();
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || "Save failed.");
    } finally { setBusy(false); }
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      await uploadEcomImage(itemId, file, { sort_order: (data?.images?.length || 0) });
      setFile(null);
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || "Upload failed.");
    } finally { setBusy(false); }
  };

  const removeImg = async (imgId) => {
    setBusy(true); setError(null);
    try {
      await deleteEcomImage(itemId, imgId);
      load();
    } catch (e) {
      setError("Delete failed.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="h4">{data?.item_code} · {data?.item_name}</Typography>
          <Typography variant="caption" color="text.secondary">Item #{itemId}</Typography>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2}>
          <TextField
            size="small" label="Slug (storefront URL)" required
            value={form.slug || ""}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            helperText="Lowercase, hyphenated. e.g. md-jam-mango-300g"
          />
          <TextField
            size="small" label="Short description" multiline minRows={2}
            value={form.short_description || ""}
            onChange={(e) => setForm((f) => ({ ...f, short_description: e.target.value }))}
          />
          <TextField
            size="small" label="Long description" multiline minRows={4}
            value={form.long_description || ""}
            onChange={(e) => setForm((f) => ({ ...f, long_description: e.target.value }))}
          />
          <TextField
            size="small" label="SEO title"
            value={form.seo_title || ""}
            onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))}
          />
          <TextField
            size="small" label="SEO description"
            value={form.seo_description || ""}
            onChange={(e) => setForm((f) => ({ ...f, seo_description: e.target.value }))}
          />
          <FormControlLabel
            control={<Switch checked={!!form.is_published}
              onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))} />}
            label="Published on storefront"
          />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Images</Typography>
            <Grid container spacing={1.5}>
              {(data?.images || []).map((img) => (
                <Grid item key={img.id} xs={6} sm={4} md={3}>
                  <Box sx={{ position: "relative", border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
                    {img.url && <img src={img.url} alt={img.alt_text} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />}
                    <IconButton size="small"
                      sx={{ position: "absolute", top: 4, right: 4, bgcolor: "rgba(255,255,255,0.85)" }}
                      onClick={() => removeImg(img.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Grid>
              ))}
            </Grid>
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} alignItems="center">
              <Button component="label" size="small" variant="outlined">
                {file ? file.name : "Choose file"}
                <input type="file" hidden accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </Button>
              <Button size="small" variant="contained" disabled={!file || busy} onClick={upload}>
                Upload
              </Button>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">Close</Button>
        <Button variant="contained" disabled={busy || !form.slug} onClick={save}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ProductEnrichmentPage() {
  const [q, setQ] = useState("");
  const [published, setPublished] = useState("");
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  const refresh = () => {
    setLoading(true); setError(null);
    listEcomProducts({
      ...(q ? { q } : {}),
      ...(published ? { published } : {}),
      page, page_size: pageSize,
    })
      .then(({ data }) => {
        setRows((data.results || []).map((r) => ({ id: r.id, ...r })));
        setCount(data.count || 0);
      })
      .catch(() => setError("Could not load products."))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, [q, published, page, pageSize]);

  const columns = useMemo(() => [
    { field: "item_code", headerName: "Code", width: 120 },
    { field: "item_name", headerName: "Item", flex: 1.6, minWidth: 220 },
    { field: "category", headerName: "Category", width: 140 },
    { field: "slug", headerName: "Slug", width: 200 },
    {
      field: "is_published", headerName: "Status", width: 110,
      renderCell: (p) => p.value
        ? <Chip size="small" color="success" label="published" />
        : <Chip size="small" color="default" label="draft" />,
    },
    { field: "image_count", headerName: "Images", width: 90, type: "number" },
    {
      field: "_actions", headerName: " ", width: 100, sortable: false,
      renderCell: (p) => (
        <Button size="small" onClick={() => setOpenId(p.row.id)}>Edit</Button>
      ),
    },
  ], []);

  return (
    <Layout>
      <PageHeader
        title="Product Enrichment"
        subtitle="Add slugs, descriptions, SEO, and images so items appear on the storefront"
        icon={<CollectionsIcon />}
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              size="small" label="Search" value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="code or name…"
              sx={{ minWidth: 220 }}
            />
            <TextField
              size="small" select label="Status" value={published}
              onChange={(e) => { setPublished(e.target.value); setPage(1); }}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Published</MenuItem>
              <MenuItem value="false">Draft</MenuItem>
            </TextField>
            <Button onClick={refresh}>Refresh</Button>
          </Stack>
        }
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <DataTable
        rows={rows} columns={columns} loading={loading} toolbar
        height={600}
        initialPageSize={pageSize}
        pageSizeOptions={[10, 25, 50, 100]}
        rowCount={count}
        paginationMode="server"
        page={page - 1}
        onPaginationModelChange={(m) => {
          if (m.pageSize !== pageSize) setPageSize(m.pageSize);
          setPage((m.page || 0) + 1);
        }}
      />
      {openId && (
        <ProductDialog
          itemId={openId}
          onClose={() => setOpenId(null)}
          onSaved={refresh}
        />
      )}
    </Layout>
  );
}
