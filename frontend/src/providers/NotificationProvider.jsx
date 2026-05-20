import { useCallback, useMemo } from "react";
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

// Returns a stable object reference across renders. The previous version
// returned a fresh object literal every call, which busted useEffect /
// useCallback dependency chains in any page that listed `notify` as a dep
// — producing infinite render loops on /uploaded-sheets and similar pages.
export function useNotify() {
  const { enqueueSnackbar } = useSnackbar();
  return useMemo(() => ({
    success: (msg, opts) => enqueueSnackbar(msg, { variant: "success", ...opts }),
    error:   (msg, opts) => enqueueSnackbar(msg, { variant: "error",   ...opts }),
    warning: (msg, opts) => enqueueSnackbar(msg, { variant: "warning", ...opts }),
    info:    (msg, opts) => enqueueSnackbar(msg, { variant: "info",    ...opts }),
  }), [enqueueSnackbar]);
}

export function useNotification() {
  const { enqueueSnackbar } = useSnackbar();
  const notify = useCallback(
    (msg, variant = "default", opts) => enqueueSnackbar(msg, { variant, ...opts }),
    [enqueueSnackbar],
  );
  return { notify };
}
