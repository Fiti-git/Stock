import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box, Button, Card, CardContent, Chip, IconButton, MenuItem,
  Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  createTransferDraft, listTransfers, requestTransfer,
} from "../../api/transfers";
import { getOutlets } from "../../api/outlets";
import { searchCatalog } from "../../api/items";
import { useAuth } from "../../contexts/AuthContext";

/**
 * List of DRAFT/REQUESTED transfers + a creation form.
 *
 * The form lets the user pick a destination outlet and add lines via item
 * search; on submit a DRAFT is created. The user can promote a draft to
 * REQUESTED inline from the list.
 */
export default function TransferRequestPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [transfers, setTransfers] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [destOutlet, setDestOutlet] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const myOutletId = user?.outlet || null;

  async function refresh() {
    const params = { status: "" };
    const draftRes = await listTransfers({ status: "draft" });
    const reqRes = await listTransfers({ status: "requested" });
    setTransfers([...(draftRes.data || []), ...(reqRes.data || [])]);
  }

  useEffect(() => {
    getOutlets().then((r) => setOutlets(r.data || [])).catch(() => {});
    refresh().catch(() => {});
  }, []);

  useEffect(() => {
    if (!search || search.length < 2) {
      setSearchResults([]);
      return;
    }
    const id = setTimeout(() => {
      searchCatalog(search, myOutletId)
        .then((r) => setSearchResults((r.data?.results || r.data || []).slice(0, 8)))
        .catch(() => setSearchResults([]));
    }, 220);
    return () => clearTimeout(id);
  }, [search]);

  const destOptions = useMemo(
    () => outlets.filter((o) => o.id !== myOutletId),
    [outlets, myOutletId],
  );

  function addLine(item) {
    if (lines.find((l) => l.item === item.id)) return;
    setLines([...lines, {
      item: item.id,
      item_code: item.item_code,
      item_name: item.item_name,
      qty_requested: 1,
    }]);
    setSearch("");
    setSearchResults([]);
  }

  function setQty(idx, qty) {
    const copy = lines.slice();
    copy[idx] = { ...copy[idx], qty_requested: qty };
    setLines(copy);
  }

  function removeLine(idx) {
    setLines(lines.filter((_, i) => i !== idx));
  }

  async function submit(promote = false) {
    setError("");
    if (!destOutlet) {
      setError("Choose a destination outlet.");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one line.");
      return;
    }
    setBusy(true);
    try {
      const res = await createTransferDraft({
        source_outlet: myOutletId,
        dest_outlet: destOutlet,
        note,
        lines: lines.map((l) => ({
          item: l.item, qty_requested: l.qty_requested,
        })),
      });
      if (promote && res.data?.id) {
        await requestTransfer(res.data.id);
      }
      setLines([]);
      setNote("");
      setDestOutlet("");
      await refresh();
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ p: 3, display: "grid", gap: 3 }}>
      <Typography variant="h5">New Transfer Request</Typography>

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              select label="Destination outlet" value={destOutlet}
              onChange={(e) => setDestOutlet(e.target.value)}
              sx={{ minWidth: 240 }}
            >
              {destOptions.map((o) => (
                <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Note" value={note} onChange={(e) => setNote(e.target.value)}
              fullWidth
            />
          </Stack>

          <TextField
            label="Search items" value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type at least 2 characters…"
            fullWidth
          />
          {searchResults.length > 0 && (
            <Paper sx={{ mt: 1, mb: 1 }}>
              {searchResults.map((it) => (
                <Box
                  key={it.id}
                  onClick={() => addLine(it)}
                  sx={{ p: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
                >
                  <strong>{it.item_code}</strong> — {it.item_name}
                </Box>
              ))}
            </Paper>
          )}

          <Table size="small" sx={{ mt: 2 }}>
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Name</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((l, idx) => (
                <TableRow key={l.item}>
                  <TableCell>{l.item_code}</TableCell>
                  <TableCell>{l.item_name}</TableCell>
                  <TableCell align="right" sx={{ width: 120 }}>
                    <TextField
                      type="number" size="small" value={l.qty_requested}
                      onChange={(e) => setQty(idx, e.target.value)}
                      inputProps={{ min: 0, step: "0.001" }}
                    />
                  </TableCell>
                  <TableCell sx={{ width: 60 }}>
                    <IconButton size="small" onClick={() => removeLine(idx)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {lines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ color: "text.secondary" }}>
                    No lines yet — search and add items above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {error && <Typography color="error" sx={{ mt: 1 }}>{error}</Typography>}

          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button variant="outlined" disabled={busy} onClick={() => submit(false)}>
              Save as Draft
            </Button>
            <Button variant="contained" disabled={busy} onClick={() => submit(true)}>
              Submit Request
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Typography variant="h6">Open Drafts &amp; Requests</Typography>
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Ref</TableCell>
              <TableCell>From</TableCell>
              <TableCell>To</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Lines</TableCell>
              <TableCell>Created</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {transfers.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.ref_no}</TableCell>
                <TableCell>{t.source_outlet_name}</TableCell>
                <TableCell>{t.dest_outlet_name}</TableCell>
                <TableCell><Chip size="small" label={t.status} /></TableCell>
                <TableCell>{t.line_count}</TableCell>
                <TableCell>{(t.created_at || "").slice(0, 16).replace("T", " ")}</TableCell>
                <TableCell>
                  <Button
                    component={RouterLink} to={`/transfers/${t.id}`}
                    size="small"
                  >
                    Open
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {transfers.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ color: "text.secondary", p: 4 }}>
                  No drafts or pending requests.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
