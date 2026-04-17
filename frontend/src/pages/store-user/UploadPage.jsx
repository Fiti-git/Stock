import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  Card, CardContent, Typography, Stack, TextField, MenuItem, Button,
  Alert, Box, Grid, CircularProgress, Chip,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ScheduleIcon from "@mui/icons-material/Schedule";
import StorefrontIcon from "@mui/icons-material/Storefront";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import { validateUpload, confirmUpload } from "../../api/uploads";
import { getOutlets } from "../../api/outlets";

const STEPS = { DATE: "date", OUTLET: "outlet", IDLE: "idle", FILE_PREVIEW: "file_preview", VALIDATING: "validating", PREVIEW: "preview", UPLOADING: "uploading", DONE: "done" };

export default function UploadPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const now = new Date();
  const todayISO = now.toLocaleDateString("en-CA");

  const [step, setStep] = useState(STEPS.DATE);
  const [uploadDate, setUploadDate] = useState(todayISO);
  const [file, setFile] = useState(null);
  const [rawRows, setRawRows] = useState([]);
  const [validation, setValidation] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState(isAdmin ? null : { id: user?.outlet_id, name: user?.outlet_name });

  useEffect(() => { if (isAdmin) getOutlets().then(({ data }) => setOutlets(data)).catch(() => {}); }, [isAdmin]);

  const parseRawRows = (f) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }).slice(0, 50));
      } catch { resolve([]); }
    };
    reader.readAsArrayBuffer(f);
  });

  const handleFileChosen = useCallback(async (f) => {
    if (!f) return;
    if (!["xls", "xlsx"].includes(f.name.split(".").pop().toLowerCase())) { setError("Only .xls and .xlsx files accepted."); return; }
    setError(""); setFile(f); setRawRows(await parseRawRows(f)); setStep(STEPS.FILE_PREVIEW);
  }, []);

  const handleDrop = useCallback((e) => { e.preventDefault(); setDragging(false); handleFileChosen(e.dataTransfer.files[0]); }, [handleFileChosen]);

  const handleProceedToValidate = async () => {
    setStep(STEPS.VALIDATING);
    try {
      const { data } = await validateUpload(file, uploadDate, isAdmin ? selectedOutlet?.id : null);
      setValidation(data); setStep(STEPS.PREVIEW);
    } catch (err) { setError(err.response?.data?.detail || "Validation failed."); setStep(STEPS.FILE_PREVIEW); }
  };

  const handleConfirm = async (overwrite = false) => {
    setStep(STEPS.UPLOADING); setError("");
    try {
      const { data } = await confirmUpload(file, overwrite, uploadDate, isAdmin ? selectedOutlet?.id : null);
      setResult(data); setStep(STEPS.DONE);
    } catch (err) {
      setError(err.response?.status === 409 ? "A successful upload already exists for this date." : err.response?.data?.detail || "Upload failed.");
      setStep(STEPS.PREVIEW);
    }
  };

  const reset = () => {
    setStep(STEPS.DATE); setUploadDate(todayISO); setFile(null); setRawRows([]); setValidation(null); setResult(null); setError("");
    if (inputRef.current) inputRef.current.value = "";
    setSelectedOutlet(isAdmin ? null : { id: user?.outlet_id, name: user?.outlet_name });
  };

  return (
    <Layout>
      <PageHeader
        title="Upload Daily Stock"
        subtitle={<>{user?.username} · <Link to="/upload/history" style={{ color: "inherit" }}>View history →</Link></>}
        icon={<UploadFileIcon />}
      />

      <Box sx={{ maxWidth: 640, mx: "auto" }}>
        {step === STEPS.DATE && (
          <Card variant="outlined"><CardContent>
            <Typography variant="h4" gutterBottom>Select Upload Date</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Choose the date this stock data is for.</Typography>
            <TextField fullWidth size="small" type="date" label="Stock date" InputLabelProps={{ shrink: true }}
              value={uploadDate} inputProps={{ max: todayISO }} onChange={(e) => setUploadDate(e.target.value)} sx={{ mb: 2 }} />
            {uploadDate !== todayISO && (
              <Alert severity="warning" variant="outlined" sx={{ mb: 2 }}>Past-date uploads require <b>admin approval</b> before taking effect.</Alert>
            )}
            <Button fullWidth variant="contained" size="large" disabled={!uploadDate} onClick={() => setStep(STEPS.OUTLET)}>Continue →</Button>
          </CardContent></Card>
        )}

        {step === STEPS.OUTLET && (
          <Card variant="outlined"><CardContent>
            <Typography variant="h4" gutterBottom>Select Outlet</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {isAdmin ? "Choose which outlet this XLS file belongs to." : "Confirm the outlet for this upload."}
            </Typography>
            {isAdmin ? (
              <TextField select fullWidth size="small" label="Outlet" value={selectedOutlet?.id ?? ""}
                onChange={(e) => { const f = outlets.find((o) => o.id === Number(e.target.value)); setSelectedOutlet(f ? { id: f.id, name: f.outlet_name } : null); }} sx={{ mb: 2 }}>
                <MenuItem value="">— select an outlet —</MenuItem>
                {outlets.map((o) => <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>)}
              </TextField>
            ) : (
              <Card variant="outlined" sx={{ mb: 2, bgcolor: "action.hover" }}><CardContent sx={{ display: "flex", gap: 1.5, alignItems: "center", py: 1.5 }}>
                <StorefrontIcon color="action" />
                <Box><Typography variant="caption" color="text.secondary">Your outlet</Typography><Typography variant="body2" fontWeight={600}>{selectedOutlet?.name ?? user?.outlet_name ?? "—"}</Typography></Box>
              </CardContent></Card>
            )}
            <Stack direction="row" spacing={1}>
              <Button fullWidth variant="outlined" onClick={() => setStep(STEPS.DATE)}>← Back</Button>
              <Button fullWidth variant="contained" disabled={!selectedOutlet?.id} onClick={() => setStep(STEPS.IDLE)}>Continue →</Button>
            </Stack>
          </CardContent></Card>
        )}

        {(step === STEPS.IDLE || step === STEPS.VALIDATING) && (
          <>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <Chip icon={<StorefrontIcon />} label={<>Uploading to: <b>{selectedOutlet?.name}</b></>} variant="outlined" />
              <Button size="small" onClick={() => setStep(STEPS.OUTLET)}>Change</Button>
            </Stack>
            <Card variant="outlined" sx={{ borderStyle: "dashed", borderColor: dragging ? "primary.main" : "divider", bgcolor: dragging ? "action.selected" : "background.paper", cursor: "pointer" }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} onClick={() => inputRef.current?.click()}>
              <CardContent sx={{ textAlign: "center", py: 6 }}>
                <input ref={inputRef} type="file" accept=".xls,.xlsx" hidden onChange={(e) => handleFileChosen(e.target.files[0])} />
                {step === STEPS.VALIDATING
                  ? <><CircularProgress size={28} /><Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Validating file…</Typography></>
                  : <>
                    <UploadFileIcon sx={{ fontSize: 48, color: "text.secondary" }} />
                    <Typography variant="subtitle1" sx={{ mt: 2 }}>Drop your XLS file here or <Box component="span" sx={{ color: "primary.main" }}>browse</Box></Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>.xls and .xlsx accepted</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Stock date: <b>{uploadDate}</b> · <Box component="span" onClick={(e) => { e.stopPropagation(); setStep(STEPS.DATE); }} sx={{ color: "primary.main", cursor: "pointer" }}>Change</Box></Typography>
                  </>
                }
              </CardContent>
            </Card>
          </>
        )}

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        {step === STEPS.FILE_PREVIEW && (
          <>
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent sx={{ pb: 1 }}>
                <Typography variant="h4">File Preview</Typography>
                <Typography variant="caption" color="text.secondary">Showing first {rawRows.length} rows of <b>{file?.name}</b> · Outlet: <b>{selectedOutlet?.name}</b></Typography>
              </CardContent>
              <Box sx={{ maxHeight: 320, overflow: "auto", border: 1, borderColor: "divider", m: 2, mt: 0, borderRadius: 1 }}>
                <Box component="table" sx={{ fontSize: "0.75rem", width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {rawRows.map((row, ri) => (
                      <tr key={ri} style={{ background: ri % 2 ? "rgba(0,0,0,0.02)" : "transparent" }}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{ padding: "4px 10px", borderBottom: "1px solid rgba(0,0,0,0.05)", maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{String(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Box>
              </Box>
            </Card>
            <Stack direction="row" spacing={1}>
              <Button fullWidth color="error" variant="outlined" onClick={() => { setFile(null); setRawRows([]); setStep(STEPS.IDLE); if (inputRef.current) inputRef.current.value = ""; }}>Remove file</Button>
              <Button fullWidth variant="contained" onClick={handleProceedToValidate}>Looks good — Validate →</Button>
            </Stack>
          </>
        )}

        {step === STEPS.PREVIEW && validation && (
          <>
            <Card variant="outlined" sx={{ mb: 2 }}><CardContent>
              <Typography variant="h4" gutterBottom>Validation Result</Typography>

              {validation.outlet_mismatch && (
                <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
                  <Typography fontWeight={600}>Wrong outlet file — upload blocked</Typography>
                  This file is for <b>{validation.outlet_mismatch.found}</b> but you're uploading to <b>{validation.outlet_mismatch.expected}</b>.
                </Alert>
              )}
              {!validation.valid && !validation.outlet_mismatch && (
                <Alert severity="error" sx={{ mb: 2 }}>{validation.errors.map((e, i) => <div key={i}>{e}</div>)}</Alert>
              )}
              {validation.warnings?.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>{validation.warnings.map((w, i) => <div key={i}>{w}</div>)}</Alert>
              )}
              {validation.needs_approval && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  This file is dated <b>{validation.preview?.snapshot_date}</b>. It will be submitted for admin approval before taking effect.
                </Alert>
              )}
              {validation.duplicate && !validation.needs_approval && (
                <Alert severity={isAdmin ? "warning" : "error"} sx={{ mb: 2 }}>
                  {isAdmin ? "A successful upload already exists for this date. As admin, you can override." : "An upload already exists for today. Only an admin can override."}
                </Alert>
              )}

              {validation.valid && validation.preview && (
                <Grid container spacing={1.5}>
                  {[
                    { label: "Total items", value: validation.preview.total_rows },
                    { label: "Matched", value: validation.preview.matched, color: "success.main" },
                    { label: "New (need barcode)", value: validation.preview.new_items, color: validation.preview.new_items > 0 ? "warning.main" : "text.primary" },
                    { label: "Data changed", value: validation.preview.changed_items ?? 0, color: (validation.preview.changed_items ?? 0) > 0 ? "info.main" : "text.primary" },
                  ].map((c) => (
                    <Grid key={c.label} item xs={6} md={3}>
                      <Card variant="outlined" sx={{ textAlign: "center", p: 1.5 }}>
                        <Typography variant="h3" sx={{ color: c.color || "text.primary" }}>{c.value ?? "—"}</Typography>
                        <Typography variant="caption" color="text.secondary">{c.label}</Typography>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: "block" }}>
                File: <b>{file?.name}</b> · Stock date: <b>{uploadDate}</b>
              </Typography>
            </CardContent></Card>

            <Stack direction="row" spacing={1}>
              <Button fullWidth variant="outlined" onClick={() => { setValidation(null); setStep(STEPS.FILE_PREVIEW); }}>← Back</Button>
              {validation.valid && !(validation.duplicate && !validation.needs_approval && !isAdmin) && (
                <Button fullWidth variant="contained" onClick={() => handleConfirm(validation.duplicate && !validation.needs_approval)}>
                  {validation.needs_approval ? "Submit for Approval" : validation.duplicate ? "Override & Import" : "Confirm Import"}
                </Button>
              )}
            </Stack>
          </>
        )}

        {step === STEPS.UPLOADING && (
          <Box sx={{ textAlign: "center", py: 6 }}>
            <CircularProgress /><Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Importing {file?.name}…</Typography>
          </Box>
        )}

        {step === STEPS.DONE && result && (
          <Card variant="outlined"><CardContent sx={{ textAlign: "center", py: 4 }}>
            {result.needs_approval ? (
              <>
                <ScheduleIcon sx={{ fontSize: 56, color: "warning.main", mb: 2 }} />
                <Typography variant="h3">Submitted for Approval</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Upload for <b>{result.snapshot_date}</b> is pending admin approval.
                </Typography>
              </>
            ) : (
              <>
                <CheckCircleIcon sx={{ fontSize: 56, color: "success.main", mb: 2 }} />
                <Typography variant="h3">Upload Complete</Typography>
                <Grid container spacing={1.5} sx={{ mt: 2 }}>
                  {[
                    { label: "Total", value: result.total_rows },
                    { label: "Matched", value: result.matched, color: "success.main" },
                    { label: "New (pending barcode)", value: result.new_items, color: result.new_items > 0 ? "warning.main" : "text.disabled" },
                    { label: "Data changed", value: result.changed_items ?? 0, color: (result.changed_items ?? 0) > 0 ? "info.main" : "text.disabled" },
                  ].map((c) => (
                    <Grid key={c.label} item xs={6} md={3}>
                      <Card variant="outlined" sx={{ p: 1.5 }}>
                        <Typography variant="h3" sx={{ color: c.color || "text.primary" }}>{c.value}</Typography>
                        <Typography variant="caption" color="text.secondary">{c.label}</Typography>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
              <Button fullWidth variant="outlined" onClick={reset}>Upload Another</Button>
              <Button fullWidth variant="contained" component={Link} to="/upload/history">View History</Button>
            </Stack>
          </CardContent></Card>
        )}
      </Box>
    </Layout>
  );
}
