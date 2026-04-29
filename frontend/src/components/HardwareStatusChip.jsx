import { useEffect, useState, useRef } from "react";
import { Chip, Tooltip } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { probeAgent } from "../lib/hardware";

/**
 * HardwareStatusChip — polls the local hardware-bridge agent every 60s and
 * shows a green "Printer OK" / red "Printer offline" chip in the POS header.
 */
export default function HardwareStatusChip({ pollMs = 60000 }) {
  const [status, setStatus] = useState({ available: false, version: undefined, checked: false });
  const timerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const r = await probeAgent();
      if (alive) setStatus({ ...r, checked: true });
    };
    check();
    timerRef.current = setInterval(check, pollMs);
    return () => {
      alive = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pollMs]);

  const label = status.available
    ? `Printer OK${status.version ? ` v${status.version}` : ""}`
    : status.checked
      ? "Printer offline"
      : "Printer ...";
  const color = status.available ? "success" : status.checked ? "error" : "default";
  const tooltip = status.available
    ? "Local hardware bridge agent is reachable."
    : "Local hardware bridge agent unreachable; receipts will fall back to browser print.";

  return (
    <Tooltip title={tooltip}>
      <Chip
        size="small"
        color={color}
        icon={<PrintIcon style={{ fontSize: 16 }} />}
        label={label}
        variant={status.available ? "filled" : "outlined"}
      />
    </Tooltip>
  );
}
