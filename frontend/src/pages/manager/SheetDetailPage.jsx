import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Typography, Stack, Card, Chip, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, CircularProgress, Alert,
  TextField, InputAdornment, Pagination, Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HistoryIcon from "@mui/icons-material/History";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import Layout from "../../components/Layout";
import { getUploadedSheetDetail, deleteUploadedSheet } from "../../api/uploads";

const PIPELINE_META = {
  pos:           { label: "POS Snapshot",       color: "#6366f1" },
  damage:        { label: "Damage / Wastage",    color: "#ef4444" },
  office:        { label: "Office Use",          color: "#64748b" },
  verification:  { label: "Verification",        color: "#06b6d4" },
  grn:           { label: "GRN",                color: "#22c55e" },
  rts:           { label: "Return to Supplier",  color: "#f59e0b" },
  sales:         { label: "Sales",              color: "#3b82f6" },
  sales_returns: { label: "Sales Returns",      color: "#a855f7" },
};

const STATUS_CHIP = {
  auto:     { label: "Auto-approved", color: "success" },
  approved: { label: "Approved",      color: "success" },
  pending:  { label: "Pending",       color: "warning" },
  rejected: { label: "Rejected",      color: "error" },
};

const PAGE_SIZE = 100;

export default function SheetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!sheet) {
      setLoading(true);
    } else {
      setPageLoading(true);
    }
    getUploadedSheetDetail(id, { page, page_size: PAGE_SIZE })
      .then((r) => setSheet(r.data))
      .catch(() => setError("Sheet not found or access denied."))
      .finally(() => { setLoading(false); setPageLoading(false); });
  }, [id, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteUploadedSheet(id);
      navigate("/uploaded-sheets");
    } catch {
      setError("Delete failed. You may not have permission to delete this upload.");
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const meta = sheet
    ? (PIPELINE_META[sheet.pipeline] || { label: sheet.pipeline_label || sheet.pipeline, color: "#64748b" })
    : null;
  const statusChip = sheet
    ? (STATUS_CHIP[sheet.approval_status] || { label: sheet.approval_status, color: "default" })
    : null;

  const columns = sheet?.columns || [];
  const pageRows = sheet?.rows || [];

  const visibleRows = search
    ? pageRows.filter((r) =>
        columns.some((c) => String(r[c] ?? "").toLowerCase().includes(search.toLowerCase()))
      )
    : pageRows;

  const totalPages = sheet?.total_pages ?? 1;
  const totalCount = sheet?.count ?? 0;

  return (
    <Layout>
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/uploaded-sheets")}
          sx={{ textTransform: "none", color: "rgba(15,23,42,0.6)", "&:hover": { color: "#0f172a" } }}
        >
          Back to Uploaded Sheets
        </Button>
        {sheet && (
          <Stack direction="row" spacing={1}>
            <Button
              size="small" startIcon={<UploadFileIcon />}
              onClick={() => navigate("/transactions", { state: { pipeline: sheet.pipeline, outletId: sheet.outlet_id, dateFrom: sheet.business_date, dateTo: sheet.business_date_to || sheet.business_date } })}
              sx={{ textTransform: "none", color: "#6366f1", borderColor: "#6366f1" }}
              variant="outlined"
            >
              Re-upload
            </Button>
            <Button
              size="small" startIcon={<DeleteIcon />} color="error" variant="outlined"
              onClick={() => setDeleteOpen(true)}
              sx={{ textTransform: "none" }}
            >
              Delete
            </Button>
          </Stack>
        )}
      </Box>

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "#6366f1" }} />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {sheet && meta && (
        <>
          {/* Header card */}
          <Card
            elevation={0}
            sx={{ border: "1px solid rgba(15,23,42,0.1)", borderRadius: 2, mb: 3, overflow: "hidden" }}
          >
            <Box
              sx={{
                height: 4,
                background: `linear-gradient(90deg, ${meta.color}, ${meta.color}88)`,
              }}
            />
            <Box sx={{ p: 3 }}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                justifyContent="space-between"
                alignItems={{ md: "center" }}
                gap={2}
              >
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Box
                    sx={{
                      width: 46, height: 46, borderRadius: 1.5,
                      display: "grid", placeItems: "center",
                      bgcolor: `${meta.color}18`,
                      color: meta.color,
                      flexShrink: 0,
                    }}
                  >
                    <HistoryIcon sx={{ fontSize: 24 }} />
                  </Box>
                  <Box>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                      <Typography sx={{ fontWeight: 800, fontSize: "1.2rem", color: "#0f172a" }}>
                        {meta.label}
                      </Typography>
                      <Chip size="small" label={statusChip.label} color={statusChip.color} />
                    </Stack>
                    <Typography sx={{ fontSize: "0.82rem", color: "rgba(15,23,42,0.55)" }}>
                      {sheet.outlet_name}
                      {" · "}
                      {sheet.business_date}
                      {sheet.business_date_to && sheet.business_date_to !== sheet.business_date
                        ? ` – ${sheet.business_date_to}`
                        : ""}
                    </Typography>
                  </Box>
                </Stack>

                <Stack direction="row" spacing={4} flexWrap="wrap">
                  {[
                    { label: "Rows", value: totalCount.toLocaleString() },
                    { label: "Uploaded by", value: sheet.uploaded_by || "—" },
                    {
                      label: "Uploaded at",
                      value: sheet.uploaded_at ? new Date(sheet.uploaded_at).toLocaleString() : "—",
                    },
                  ].map(({ label, value }) => (
                    <Box key={label} sx={{ textAlign: "right" }}>
                      <Typography
                        sx={{
                          fontSize: "0.7rem", color: "rgba(15,23,42,0.4)",
                          textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600,
                        }}
                      >
                        {label}
                      </Typography>
                      <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>
                        {value}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Stack>

              {sheet.filename && (
                <Typography
                  sx={{
                    mt: 1.5, fontSize: "0.75rem",
                    color: "rgba(15,23,42,0.35)", fontFamily: "monospace",
                    bgcolor: "#f8fafc", display: "inline-block", px: 1, py: 0.25, borderRadius: 1,
                  }}
                >
                  {sheet.filename}
                </Typography>
              )}
            </Box>
          </Card>

          {/* Table card */}
          <Card elevation={0} sx={{ border: "1px solid rgba(15,23,42,0.1)", borderRadius: 2 }}>
            <Box
              sx={{
                px: 2.5, py: 1.5,
                borderBottom: "1px solid rgba(15,23,42,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
                flexWrap: "wrap",
              }}
            >
              <TextField
                size="small"
                placeholder="Search current page…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 16, color: "rgba(15,23,42,0.35)" }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  width: 260,
                  "& .MuiOutlinedInput-root": {
                    bgcolor: "#fff",
                    "& fieldset": { borderColor: "rgba(15,23,42,0.14)" },
                    "&:hover fieldset": { borderColor: "rgba(15,23,42,0.28)" },
                    "&.Mui-focused fieldset": { borderColor: "#6366f1", borderWidth: 1.5 },
                  },
                }}
              />
              <Typography sx={{ fontSize: "0.78rem", color: "rgba(15,23,42,0.45)" }}>
                {totalCount.toLocaleString()} total row{totalCount !== 1 ? "s" : ""}
                {totalPages > 1 && ` · page ${page} / ${totalPages}`}
              </Typography>
            </Box>

            {columns.length === 0 ? (
              <Box sx={{ p: 6, textAlign: "center" }}>
                <Typography sx={{ color: "rgba(15,23,42,0.4)", fontSize: "0.9rem" }}>
                  No row data recorded for this upload.
                </Typography>
              </Box>
            ) : (
              <>
                <Box sx={{ position: "relative" }}>
                  {pageLoading && (
                    <Box
                      sx={{
                        position: "absolute", inset: 0, zIndex: 2,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        bgcolor: "rgba(255,255,255,0.7)",
                      }}
                    >
                      <CircularProgress size={32} sx={{ color: "#6366f1" }} />
                    </Box>
                  )}
                  <TableContainer sx={{ maxHeight: "60vh" }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell
                            sx={{
                              fontWeight: 700, bgcolor: "#f8fafc",
                              color: "rgba(15,23,42,0.5)", fontSize: "0.73rem",
                              py: 1.25, borderBottom: "1px solid rgba(15,23,42,0.1)",
                            }}
                          >
                            #
                          </TableCell>
                          {columns.map((c) => (
                            <TableCell
                              key={c}
                              sx={{
                                fontWeight: 700, bgcolor: "#f8fafc",
                                color: "rgba(15,23,42,0.5)", fontSize: "0.73rem",
                                whiteSpace: "nowrap", py: 1.25,
                                borderBottom: "1px solid rgba(15,23,42,0.1)",
                              }}
                            >
                              {c}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {visibleRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={columns.length + 1} align="center" sx={{ py: 4, color: "rgba(15,23,42,0.4)" }}>
                              {search ? "No rows match your search on this page." : "No rows on this page."}
                            </TableCell>
                          </TableRow>
                        ) : (
                          visibleRows.map((r, idx) => (
                            <TableRow
                              key={idx}
                              sx={{
                                "&:last-child td": { border: 0 },
                                "&:hover": { bgcolor: "#f8fafc" },
                              }}
                            >
                              <TableCell sx={{ color: "rgba(15,23,42,0.3)", fontSize: "0.73rem", py: 1 }}>
                                {(page - 1) * PAGE_SIZE + idx + 1}
                              </TableCell>
                              {columns.map((c) => (
                                <TableCell key={c} sx={{ whiteSpace: "nowrap", fontSize: "0.82rem", py: 1 }}>
                                  {r[c] === null || r[c] === undefined ? "" : String(r[c])}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>

                {totalPages > 1 && (
                  <Box
                    sx={{
                      display: "flex", justifyContent: "center",
                      p: 2, borderTop: "1px solid rgba(15,23,42,0.06)",
                    }}
                  >
                    <Pagination
                      count={totalPages}
                      page={page}
                      onChange={(_, p) => { setSearch(""); setPage(p); }}
                      size="small"
                    />
                  </Box>
                )}
              </>
            )}
          </Card>
        </>
      )}

      {/* Delete confirm dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Upload?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: "0.9rem", color: "rgba(15,23,42,0.7)" }}>
            This will permanently delete <strong>{(sheet?.row_count || 0).toLocaleString()} row(s)</strong> from the database and remove this sheet record.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button
            onClick={handleDelete} color="error" variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}
            sx={{ textTransform: "none" }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
