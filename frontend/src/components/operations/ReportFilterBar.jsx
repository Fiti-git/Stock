import { useEffect, useState } from "react";
import {
  Paper, Stack, TextField, MenuItem, Button,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { getOutlets } from "../../api/outlets";

/**
 * Shared date-range + outlet filter bar for the super-admin reports.
 * Keeps filter state in the parent via `value` / `onChange({...})`. Emits
 * an `onApply` callback when the user clicks Refresh.
 */
export default function ReportFilterBar({ value, onChange, onApply, loading }) {
  const [outlets, setOutlets] = useState([]);
  useEffect(() => {
    getOutlets().then(({ data }) => setOutlets(data)).catch(() => {});
  }, []);

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
        <TextField
          size="small" type="date" label="From"
          InputLabelProps={{ shrink: true }}
          value={value.fromDate}
          onChange={(e) => onChange({ ...value, fromDate: e.target.value })}
        />
        <TextField
          size="small" type="date" label="To"
          InputLabelProps={{ shrink: true }}
          value={value.toDate}
          onChange={(e) => onChange({ ...value, toDate: e.target.value })}
        />
        <TextField
          size="small" select label="Outlet"
          value={value.outletId || ""}
          onChange={(e) => onChange({ ...value, outletId: e.target.value || "" })}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">All outlets</MenuItem>
          {outlets.map((o) => (
            <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>
          ))}
        </TextField>
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={onApply}
          disabled={loading}
        >
          Refresh
        </Button>
      </Stack>
    </Paper>
  );
}
