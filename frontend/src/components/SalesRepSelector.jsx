import { useEffect, useState } from "react";
import { Autocomplete, TextField } from "@mui/material";
import { listSalesReps } from "../api/pos";

/**
 * Phase 3 Agent 10 — small dropdown that lists active users who can be
 * attributed as a "sales rep" for a bill. Used in the POS terminal header.
 */
export default function SalesRepSelector({ value, onChange, outletId, size = "small" }) {
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    listSalesReps(outletId ? { outlet: outletId } : {})
      .then((r) => { if (!cancel) setReps(r.data?.results || []); })
      .catch(() => { if (!cancel) setReps([]); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [outletId]);

  const selected = reps.find((r) => r.id === value) || null;

  return (
    <Autocomplete
      size={size}
      sx={{ minWidth: 200 }}
      options={reps}
      loading={loading}
      value={selected}
      onChange={(_e, v) => onChange?.(v ? v.id : null)}
      getOptionLabel={(o) => o?.username || ""}
      isOptionEqualToValue={(o, v) => o.id === v?.id}
      renderInput={(params) => (
        <TextField {...params} label="Sales Rep" placeholder="(optional)" />
      )}
    />
  );
}
