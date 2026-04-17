// Backward-compat shim over MUI Alert. Preserves existing <Alert type="error">...</Alert> usage.
import { Alert as MuiAlert } from "@mui/material";

const MAP = { error: "error", success: "success", warning: "warning", info: "info" };

export default function Alert({ type = "info", children, onClose, ...rest }) {
  return (
    <MuiAlert severity={MAP[type] || "info"} variant="outlined" onClose={onClose} {...rest}>
      {children}
    </MuiAlert>
  );
}
