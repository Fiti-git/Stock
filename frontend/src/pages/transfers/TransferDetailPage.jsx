import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert, Box, Button, Card, CardContent, Chip, Paper, Stack, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import {
  cancelTransfer, closeTransfer, dispatchTransfer, getTransfer,
  receiveTransfer, requestTransfer,
} from "../../api/transfers";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Full detail for a StockTransfer:
 *   - header (status, parties, timestamps)
 *   - line table with qty_requested / qty_dispatched / qty_received / variance
 *   - timeline of TransferEvent rows
 *   - action buttons appropriate to current status + user role
 */
export default function TransferDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [t, setT] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [varianceNote, setVarianceNote] = useState("");

  async function load() {
    setError("");
    try {
      const res = await getTransfer(id);
      setT(res.data);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Failed to load");
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function run(fn) {
    setBusy(true);
    setError("");
    try { await fn(); await load(); }
    catch (e) { setError(e?.response?.data?.detail || e.message || "Failed"); }
    finally { setBusy(false); }
  }

  if (!t) {
    return <Box sx={{ p: 3 }}>{error || "Loading…"}</Box>;
  }

  const isAdmin = ["admin", "super_admin"].includes(user?.role);
  const isManager = ["manager", "admin", "super_admin"].includes(user?.role);
  const atSrc = user?.outlet === t.source_outlet;
  const atDst = user?.outlet === t.dest_outlet;

  const canRequest = t.status === "draft" && (isAdmin || atSrc || atDst);
  const canDispatch = t.status === "requested" && (isAdmin || (isManager && atSrc));
  const canReceive = t.status === "dispatched" && (isAdmin || (isManager && atDst));
  const canClose = ["received", "variance_review"].includes(t.status) && (isAdmin || (isManager && (atSrc || atDst)));
  const canCancel = ["draft", "requested", "dispatched"].includes(t.status) && (isAdmin || atSrc || atDst);

  return (
    <Box sx={{ p: 3, display: "grid", gap: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">
          {t.ref_no} <Chip label={t.status} size="small" sx={{ ml: 1 }} />
        </Typography>
        <Button onClick={() => nav("/transfers/request")}>Back to list</Button>
      </Stack>

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={4}>
            <Box>
              <Typography variant="overline">From</Typography>
              <Typography>{t.source_outlet_name}</Typography>
            </Box>
            <Box>
              <Typography variant="overline">To</Typography>
              <Typography>{t.dest_outlet_name}</Typography>
            </Box>
            <Box>
              <Typography variant="overline">Created</Typography>
              <Typography>{(t.created_at || "").slice(0, 16).replace("T", " ")}</Typography>
            </Box>
            <Box>
              <Typography variant="overline">Note</Typography>
              <Typography>{t.note || "—"}</Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Name</TableCell>
              <TableCell align="right">Requested</TableCell>
              <TableCell align="right">Dispatched</TableCell>
              <TableCell align="right">Received</TableCell>
              <TableCell align="right">Variance</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(t.lines || []).map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.item_code}</TableCell>
                <TableCell>{l.item_name}</TableCell>
                <TableCell align="right">{l.qty_requested}</TableCell>
                <TableCell align="right">{l.qty_dispatched}</TableCell>
                <TableCell align="right">{l.qty_received}</TableCell>
                <TableCell align="right" sx={{ color: l.variance ? "error.main" : "inherit" }}>
                  {l.variance}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction="row" spacing={1} flexWrap="wrap">
        {canRequest && (
          <Button variant="contained" disabled={busy}
            onClick={() => run(() => requestTransfer(t.id))}
          >Submit Request</Button>
        )}
        {canDispatch && (
          <Button variant="contained" disabled={busy}
            onClick={() => run(() => dispatchTransfer(t.id, (t.lines || []).map((l) => ({
              line_id: l.id, qty_dispatched: l.qty_requested,
            }))))}
          >Dispatch (defaults)</Button>
        )}
        {canReceive && (
          <Button variant="contained" disabled={busy}
            onClick={() => run(() => receiveTransfer(t.id, (t.lines || []).map((l) => ({
              line_id: l.id, qty_received: l.qty_dispatched,
            }))))}
          >Receive (full)</Button>
        )}
        {canClose && (
          <>
            <TextField size="small" label="Variance note" value={varianceNote}
              onChange={(e) => setVarianceNote(e.target.value)} />
            <Button variant="contained" color="success" disabled={busy}
              onClick={() => run(() => closeTransfer(t.id, varianceNote))}
            >Close</Button>
          </>
        )}
        {canCancel && (
          <>
            <TextField size="small" label="Cancel reason" value={reason}
              onChange={(e) => setReason(e.target.value)} />
            <Button variant="outlined" color="error" disabled={busy}
              onClick={() => run(() => cancelTransfer(t.id, reason))}
            >Cancel Transfer</Button>
          </>
        )}
      </Stack>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Timeline</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>Actor</TableCell>
                <TableCell>From</TableCell>
                <TableCell>To</TableCell>
                <TableCell>Note</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(t.events || []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{(e.created_at || "").slice(0, 19).replace("T", " ")}</TableCell>
                  <TableCell>{e.actor_username || "—"}</TableCell>
                  <TableCell>{e.from_status || "—"}</TableCell>
                  <TableCell>{e.to_status}</TableCell>
                  <TableCell>{e.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Box>
  );
}
