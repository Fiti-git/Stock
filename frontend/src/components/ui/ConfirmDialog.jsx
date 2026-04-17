import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, CircularProgress } from "@mui/material";

export default function ConfirmDialog({
  open, onClose, onConfirm, title = "Confirm", message,
  confirmLabel = "Confirm", cancelLabel = "Cancel",
  color = "error", loading = false, disableConfirm = false,
  maxWidth = "xs",
}) {
  const messageIsString = typeof message === "string";
  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth={maxWidth} fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{title}</DialogTitle>
      <DialogContent>
        {messageIsString ? <DialogContentText>{message}</DialogContentText> : message}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={loading}>{cancelLabel}</Button>
        <Button
          onClick={onConfirm}
          color={color}
          variant="contained"
          disabled={loading || disableConfirm}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
