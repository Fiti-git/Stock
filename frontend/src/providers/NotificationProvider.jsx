import { SnackbarProvider, useSnackbar } from "notistack";

export function NotificationProvider({ children }) {
  return (
    <SnackbarProvider
      maxSnack={3}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      autoHideDuration={4000}
    >
      {children}
    </SnackbarProvider>
  );
}

export function useNotify() {
  const { enqueueSnackbar } = useSnackbar();
  return {
    success: (msg, opts) => enqueueSnackbar(msg, { variant: "success", ...opts }),
    error:   (msg, opts) => enqueueSnackbar(msg, { variant: "error",   ...opts }),
    warning: (msg, opts) => enqueueSnackbar(msg, { variant: "warning", ...opts }),
    info:    (msg, opts) => enqueueSnackbar(msg, { variant: "info",    ...opts }),
  };
}

export function useNotification() {
  const { enqueueSnackbar } = useSnackbar();
  const notify = (msg, variant = "default", opts) =>
    enqueueSnackbar(msg, { variant, ...opts });
  return { notify };
}
