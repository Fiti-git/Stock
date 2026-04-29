import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { dispatchTransfer, getTransfer, listTransfers } from "../../api/transfers";
import { useAuth } from "../../contexts/AuthContext";

/**
 * List REQUESTED transfers whose source is the user's outlet, allow
 * editing per-line qty_dispatched, then dispatch in one click.
 */
export default function TransferDispatchPage() {
  const { user } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [active, setActive] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const res = await listTransfers({
      status: "requested",
      source_outlet: user?.outlet || "",
    });
    setTransfers(res.data || []);
  }

  useEffect(() => { refresh().catch(() => {}); }, [user?.outlet]);

  async function open(t) {
    setError("");
    const res = await getTransfer(t.id);
    setActive(res.data);
    const seed = {};
    (res.data.lines || []).forEach((l) => { seed[l.id] = l.qty_requested; });
    setOverrides(seed);
  }

  async function doDispatch() {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      const lines = (active.lines || []).map((l) => ({
        line_id: l.id, qty_dispatched: overrides[l.id] ?? l.qty_requested,
      }));
      await dispatchTransfer(active.id, lines);
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
      <Typography variant="h5">Dispatch Transfers (Outgoing)</Typography>

      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Ref</TableCell>
              <TableCell>To</TableCell>
              <TableCell>Lines</TableCell>
              <TableCell>Requested at</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {transfers.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.ref_no}</TableCell>
                <TableCell>{t.dest_outlet_name}</TableCell>
                <TableCell>{t.line_count}</TableCell>
                <TableCell>{(t.requested_at || "").slice(0, 16).replace("T", " ")}</TableCell>
                <TableCell>
                  <Button size="small" onClick={() => open(t)}>Prepare</Button>
                </TableCell>
              </TableRow>
            ))}
            {transfers.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ color: "text.secondary", p: 4 }}>
                  No incoming requests to dispatch.
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
              {active.ref_no} → {active.dest_outlet_name}
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
                <TableCell align="right">Requested</TableCell>
                <TableCell align="right">Dispatch</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(active.lines || []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.item_code}</TableCell>
                  <TableCell>{l.item_name}</TableCell>
                  <TableCell align="right">{l.qty_requested}</TableCell>
                  <TableCell align="right" sx={{ width: 140 }}>
                    <TextField
                      type="number" size="small" value={overrides[l.id] ?? l.qty_requested}
                      onChange={(e) => setOverrides({ ...overrides, [l.id]: e.target.value })}
                      inputProps={{ min: 0, step: "0.001" }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {error && <Typography color="error" sx={{ mt: 1 }}>{error}</Typography>}
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button variant="outlined" disabled={busy} onClick={() => setActive(null)}>Cancel</Button>
            <Button variant="contained" disabled={busy} onClick={doDispatch}>Dispatch</Button>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
