import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Card, CardContent, Typography, Stack, TextField, MenuItem, Button,
  Alert, Box, Grid, CircularProgress, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ScheduleIcon from "@mui/icons-material/Schedule";
import StorefrontIcon from "@mui/icons-material/Storefront";
import Layout from "../Layout";
import { PageHeader } from "../ui";
import { useAuth } from "../../contexts/AuthContext";
import { getOutlets } from "../../api/outlets";

/**
 * Shared upload page for date-range transaction types (damage, office,
 * verification, GRN, return-to-supply, sales, sales-returns). Wire a specific
 * type by passing a config object:
 *
 *   <TransactionUploadPage config={{
 *     label: "Office Use",
 *     icon: <AssignmentIcon />,
 *     api: officeApiBundle,
 *     historyPath: "/transactions/office/history",
 *   }} />
 */
const STEPS = {
  OUTLET: "outlet",
  FILE: "file",
  VALIDATING: "validating",
  PREVIEW: "preview",
  UPLOADING: "uploading",
  DONE: "done",
};

export default function TransactionUploadPage({ config, embedded = false, prefillDateFrom = "", prefillDateTo = "", prefillOutletId = null }) {
  const { label, icon, api, historyPath } = config;
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [step, setStep] = useState(STEPS.OUTLET);
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState(
    isAdmin ? null : { id: user?.outlet_id, name: user?.outlet_name }
  );
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [validation, setValidation] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dateFromOverride, setDateFromOverride] = useState(prefillDateFrom);
  const [dateToOverride, setDateToOverride] = useState(prefillDateTo);
  const [overlappingBatches, setOverlappingBatches] = useState(null); // 409 replace dialog
  const inputRef = useRef();

  useEffect(() => {
    if (!isAdmin) return;
    getOutlets().then(({ data }) => {
      setOutlets(data);
      if (prefillOutletId) {
        const match = data.find((o) => String(o.id) === String(prefillOutletId));
        if (match) setSelectedOutlet({ id: match.id, name: match.outlet_name });
      }
    }).catch(() => {});
  }, [isAdmin, prefillOutletId]);

  const handleFileChosen = useCallback((f) => {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["xls", "xlsx"].includes(ext)) {
      setError("Only .xls and .xlsx files accepted.");
      return;
    }
    setError("");
    setFile(f);
    setStep(STEPS.VALIDATING);
    runValidate(f);
  }, []); // eslint-disable-line

  async function runValidate(f) {
    try {
      const { data } = await api.validate(f, {
        outletId: isAdmin ? selectedOutlet?.id : null,
        dateFrom: dateFromOverride || undefined,
        dateTo: dateToOverride || undefined,
      });
      setValidation(data);
      if (data.preview?.date_from && !dateFromOverride) setDateFromOverride(data.preview.date_from);
      if (data.preview?.date_to && !dateToOverride) setDateToOverride(data.preview.date_to);
      setStep(STEPS.PREVIEW);
    } catch (err) {
      setError(err.response?.data?.detail || "Validation failed.");
      setStep(STEPS.FILE);
    }
  }

  async function runConfirm(replaceOverlapping = false) {
    setStep(STEPS.UPLOADING);
    setError("");
    try {
      const { data } = await api.confirm(file, {
        outletId: isAdmin ? selectedOutlet?.id : null,
        dateFrom: dateFromOverride || undefined,
        dateTo: dateToOverride || undefined,
        replaceOverlapping: replaceOverlapping || undefined,
      });
      setResult(data);
      setStep(STEPS.DONE);
    } catch (err) {
      const body = err.response?.data || {};
      if (err.response?.status === 409 && body.overlapping_batches) {
        setOverlappingBatches(body.overlapping_batches);
        setStep(STEPS.PREVIEW);
      } else {
        setError(body.detail || "Upload failed.");
        setStep(STEPS.PREVIEW);
      }
    }
  }

  const handleConfirm = () => runConfirm(false);
  const handleReplaceConfirm = () => { setOverlappingBatches(null); runConfirm(true); };

  const reset = () => {
    setStep(STEPS.OUTLET);
    setFile(null);
    setValidation(null);
    setResult(null);
    setError("");
    setDateFromOverride("");
    setDateToOverride("");
    setOverlappingBatches(null);
    if (inputRef.current) inputRef.current.value = "";
    setSelectedOutlet(isAdmin ? null : { id: user?.outlet_id, name: user?.outlet_name });
  };

  const body = (
    <>
      {!embedded && (
        <PageHeader
          title={`Upload ${label}`}
          subtitle={
            <>
              {user?.username} ·{" "}
              <Link to={historyPath} style={{ color: "inherit" }}>View history →</Link>
            </>
          }
          icon={icon}
        />
      )}
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        {step === STEPS.OUTLET && (
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h4" gutterBottom>Select Outlet</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {isAdmin
                  ? `Choose which outlet this ${label.toLowerCase()} report belongs to.`
                  : "Confirm the outlet for this upload."}
              </Typography>
              {isAdmin ? (
                <TextField
                  select fullWidth size="small" label="Outlet"
                  value={selectedOutlet?.id ?? ""}
                  onChange={(e) => {
                    const f = outlets.find((o) => o.id === Number(e.target.value));
                    setSelectedOutlet(f ? { id: f.id, name: f.outlet_name } : null);
                  }}
                  sx={{ mb: 2 }}
                >
                  <MenuItem value="">— select an outlet —</MenuItem>
                  {outlets.map((o) => (
                    <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>
                  ))}
                </TextField>
              ) : (
                <Card variant="outlined" sx={{ mb: 2, bgcolor: "action.hover" }}>
                  <CardContent sx={{ display: "flex", gap: 1.5, alignItems: "center", py: 1.5 }}>
                    <StorefrontIcon color="action" />
                    <Box>
                      <Typography variant="caption" color="text.secondary">Your outlet</Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {selectedOutlet?.name ?? user?.outlet_name ?? "—"}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              )}
              <Button
                fullWidth variant="contained"
                disabled={!selectedOutlet?.id}
                onClick={() => setStep(STEPS.FILE)}
              >
                Continue →
              </Button>
            </CardContent>
          </Card>
        )}

        {step === STEPS.FILE && (
          <>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <Chip
                icon={<StorefrontIcon />}
                label={<>Uploading to: <b>{selectedOutlet?.name}</b></>}
                variant="outlined"
              />
              <Button size="small" onClick={() => setStep(STEPS.OUTLET)}>Change</Button>
            </Stack>
            <Card
              variant="outlined"
              sx={{
                borderStyle: "dashed",
                borderColor: dragging ? "primary.main" : "divider",
                bgcolor: dragging ? "action.selected" : "background.paper",
                cursor: "pointer",
              }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                handleFileChosen(e.dataTransfer.files[0]);
              }}
              onClick={() => inputRef.current?.click()}
            >
              <CardContent sx={{ textAlign: "center", py: 6 }}>
                <input
                  ref={inputRef} type="file" accept=".xls,.xlsx" hidden
                  onChange={(e) => handleFileChosen(e.target.files[0])}
                />
                <UploadFileIcon sx={{ fontSize: 48, color: "text.secondary" }} />
                <Typography variant="subtitle1" sx={{ mt: 2 }}>
                  Drop the {label} XLS here or{" "}
                  <Box component="span" sx={{ color: "primary.main" }}>browse</Box>
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  .xls and .xlsx accepted · date range is auto-detected from the report banner
                </Typography>
              </CardContent>
            </Card>
          </>
        )}

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        {step === STEPS.VALIDATING && (
          <Box sx={{ textAlign: "center", py: 6 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Validating {file?.name}…
            </Typography>
          </Box>
        )}

        {step === STEPS.PREVIEW && validation && (
          <>
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h4" gutterBottom>Validation Result</Typography>

                {!validation.valid && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {validation.errors.map((e, i) => <div key={i}>{e}</div>)}
                  </Alert>
                )}

                {validation.has_overlap && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    <Typography fontWeight={600}>Overlapping batch already exists</Typography>
                    {validation.overlapping_batches.map((b) => (
                      <div key={b.id}>
                        #{b.id} — {b.date_from} to {b.date_to} · {b.total_rows} rows
                        · uploaded {new Date(b.uploaded_at).toLocaleString()} by {b.uploaded_by}
                      </div>
                    ))}
                    <Box sx={{ mt: 1 }}>
                      Delete the existing batch(es) on the{" "}
                      <Link to={historyPath}>history page</Link> first, then re-upload.
                    </Box>
                  </Alert>
                )}

                {validation.needs_approval && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    The date range ends in the past ({validation.preview?.date_to}).
                    Submission will go to admin approval before taking effect.
                  </Alert>
                )}

                {validation.valid && validation.preview && (
                  <>
                    <Grid container spacing={1.5} sx={{ mb: 2 }}>
                      {[
                        { label: "Rows", value: validation.preview.total_rows },
                        { label: "Total amount", value: `LKR ${Number(validation.preview.total_amount || 0).toLocaleString()}` },
                        { label: "Detected outlet", value: validation.preview.outlet_name || "—" },
                      ].map((c) => (
                        <Grid key={c.label} item xs={12} md={4}>
                          <Card variant="outlined" sx={{ textAlign: "center", p: 1.5 }}>
                            <Typography variant="h4">{c.value}</Typography>
                            <Typography variant="caption" color="text.secondary">{c.label}</Typography>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                      <TextField
                        type="date" label="Date from" size="small"
                        InputLabelProps={{ shrink: true }}
                        value={dateFromOverride}
                        onChange={(e) => setDateFromOverride(e.target.value)}
                        fullWidth
                      />
                      <TextField
                        type="date" label="Date to" size="small"
                        InputLabelProps={{ shrink: true }}
                        value={dateToOverride}
                        onChange={(e) => setDateToOverride(e.target.value)}
                        fullWidth
                      />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                      Adjust if the banner was wrong. Overlap detection re-runs on confirm.
                    </Typography>
                  </>
                )}

                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: "block" }}>
                  File: <b>{file?.name}</b> · Outlet: <b>{selectedOutlet?.name}</b>
                </Typography>
              </CardContent>
            </Card>

            <Stack direction="row" spacing={1}>
              <Button fullWidth variant="outlined" onClick={() => { setValidation(null); setStep(STEPS.FILE); }}>
                ← Back
              </Button>
              {validation.valid && !validation.has_overlap && (
                <Button fullWidth variant="contained" onClick={handleConfirm}>
                  {validation.needs_approval ? "Submit for Approval" : "Confirm Import"}
                </Button>
              )}
            </Stack>
          </>
        )}

        {step === STEPS.UPLOADING && (
          <Box sx={{ textAlign: "center", py: 6 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Importing {file?.name}…
            </Typography>
          </Box>
        )}

        {step === STEPS.DONE && result && (
          <Card variant="outlined">
            <CardContent sx={{ textAlign: "center", py: 4 }}>
              {result.status === "pending_approval" ? (
                <>
                  <ScheduleIcon sx={{ fontSize: 56, color: "warning.main", mb: 2 }} />
                  <Typography variant="h3">Submitted for Approval</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {label} batch #{result.batch.id} ({result.batch.date_from} to{" "}
                    {result.batch.date_to}) is pending admin approval.
                  </Typography>
                </>
              ) : (
                <>
                  <CheckCircleIcon sx={{ fontSize: 56, color: "success.main", mb: 2 }} />
                  <Typography variant="h3">Upload Complete</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {result.batch.total_rows} rows from {result.batch.date_from} to{" "}
                    {result.batch.date_to} · Total LKR{" "}
                    {Number(result.batch.total_amount).toLocaleString()}
                  </Typography>
                </>
              )}
              <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
                <Button fullWidth variant="outlined" onClick={reset}>Upload Another</Button>
                {!embedded && (
                  <Button fullWidth variant="contained" component={Link} to={historyPath}>
                    View History
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}
      </Box>
    </>
  );

  const replaceDialog = (
    <Dialog open={!!overlappingBatches} onClose={() => setOverlappingBatches(null)} maxWidth="sm" fullWidth>
      <DialogTitle>Replace Existing Upload?</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 1.5, fontSize: "0.9rem", color: "rgba(15,23,42,0.7)" }}>
          The following {(overlappingBatches || []).length > 1 ? "batches overlap" : "batch overlaps"} the
          date range you are uploading. Replacing will permanently delete the existing data before
          committing the new upload.
        </Typography>
        {(overlappingBatches || []).map((b) => (
          <Box key={b.id} sx={{ display: "flex", gap: 1, alignItems: "center", mb: 0.5 }}>
            <Chip size="small" label={`#${b.id}`} variant="outlined" />
            <Typography sx={{ fontSize: "0.82rem" }}>
              {b.date_from} – {b.date_to} &nbsp;·&nbsp; {b.total_rows?.toLocaleString()} rows
            </Typography>
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOverlappingBatches(null)} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button onClick={handleReplaceConfirm} color="error" variant="contained" sx={{ textTransform: "none" }}>
          Replace &amp; Upload
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (embedded) return <>{body}{replaceDialog}</>;
  return <Layout>{body}{replaceDialog}</Layout>;
}
