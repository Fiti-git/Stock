import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert, Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { getTransfer, listTransfers, receiveTransfer } from "../../api/transfers";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Inbound dock — list of DISPATCHED transfers TO the user's outlet.
 * Operator counts what arrived per line; on submit any deficit triggers
 * VARIANCE_REVIEW on the backend.
 */
export default function TransferReceivePage() {
  const { user } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [active, setActive] = useState(null);
  const [received, setReceived] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const res = await listTransfers({
      status: "dispatched",
      dest_outlet: user?.outlet || "",
    });
    setTransfers(res.data || []);
  }

  useEffect(() => { refresh().catch(() => {}); }, [user?.outlet]);

  async function open(t) {
    setError("");
    const res = await getTransfer(t.id);
    setActive(res.data);
    const seed = {};
    (res.data.lines || []).forEach((l) => { seed[l.id] = l.qty_dispatched; });
    setReceived(seed);
  }

  const varianceCount = useMemo(() => {
    if (!active) return 0;
    return (active.lines || []).filter((l) => {
      const got = Number(received[l.id] ?? l.qty_dispatched);
      return got !== Number(l.qty_dispatched);
    }).length;
  }, [active, received]);

  async function doReceive() {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      const lines = (active.lines || []).map((l) => ({
        line_id: l.id, qty_received: received[l.id] ?? l.qty_dispatched,
      }));
      await receiveTransfer(active.id, lines);
      setActive(null);
      await refresh();
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ p: 3, display: "grid", gap: 3 }}>
      <Typography variant="h5">Receive Transfers (Incoming)</Typography>

      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Ref</TableCell>
              <TableCell>From</TableCell>
              <TableCell>Lines</TableCell>
              <TableCell>Dispatched at</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {transfers.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.ref_no}</TableCell>
                <TableCell>{t.source_outlet_name}</TableCell>
                <TableCell>{t.line_count}</TableCell>
                <TableCell>{(t.dispatched_at || "").slice(0, 16).replace("T", " ")}</TableCell>
                <TableCell>
                  <Button size="small" onClick={() => open(t)}>Receive</Button>
                </TableCell>
              </TableRow>
            ))}
            {transfers.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ color: "text.secondary", p: 4 }}>
                  No transfers waiting to be received.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {active && (
        <Paper sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">
              {active.ref_no} ← {active.source_outlet_name}
              <Chip size="small" label={active.status} sx={{ ml: 1 }} />
            </Typography>
            <Button component={RouterLink} to={`/transfers/${active.id}`} size="small">
              View detail
            </Button>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Name</TableCell>
                <TableCell align="right">Dispatched</TableCell>
                <TableCell align="right">Received</TableCell>
                <TableCell align="right">Variance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(active.lines || []).map((l) => {
                const got = Number(received[l.id] ?? l.qty_dispatched);
                const v = Number(l.qty_dispatched) - got;
                return (
                  <TableRow key={l.id}>
                    <TableCell>{l.item_code}</TableCell>
                    <TableCell>{l.item_name}</TableCell>
                    <TableCell align="right">{l.qty_dispatched}</TableCell>
                    <TableCell align="right" sx={{ width: 140 }}>
                      <TextField
                        type="number" size="small"
                        value={received[l.id] ?? l.qty_dispatched}
                        onChange={(e) => setReceived({ ...received, [l.id]: e.target.value })}
                        inputProps={{ min: 0, step: "0.001" }}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ color: v ? "error.main" : "text.secondary" }}>
                      {v}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {varianceCount > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {varianceCount} line(s) have variance — submitting will move the
              transfer to VARIANCE_REVIEW.
            </Alert>
          )}
          {error && <Typography color="error" sx={{ mt: 1 }}>{error}</Typography>}
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button variant="outlined" disabled={busy} onClick={() => setActive(null)}>Cancel</Button>
            <Button variant="contained" disabled={busy} onClick={doReceive}>Confirm Receive</Button>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
