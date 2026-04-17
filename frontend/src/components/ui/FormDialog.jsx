import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, IconButton, Box, CircularProgress,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

export default function FormDialog({
  open, onClose, onSubmit, title, children,
  submitLabel = "Save", cancelLabel = "Cancel",
  loading = false, maxWidth = "sm", submitColor = "primary",
  disableSubmit = false,
}) {
  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth={maxWidth}>
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit?.(e); }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pr: 1 }}>
          <Box sx={{ fontWeight: 600 }}>{title}</Box>
          <IconButton onClick={onClose} disabled={loading} size="small"><CloseIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent dividers>{children}</DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={loading} color="inherit">{cancelLabel}</Button>
          <Button
            type="submit"
            variant="contained"
            color={submitColor}
            disabled={loading || disableSubmit}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
