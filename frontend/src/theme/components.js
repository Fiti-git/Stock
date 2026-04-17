// MUI component overrides for cohesive SaaS look.
export const componentOverrides = (mode) => ({
  MuiCssBaseline: {
    styleOverrides: {
      body: {
        fontFeatureSettings: '"cv11","ss01"',
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
      },
      "*::-webkit-scrollbar": { width: 10, height: 10 },
      "*::-webkit-scrollbar-thumb": {
        background: mode === "dark" ? "#334155" : "#cbd5e1",
        borderRadius: 8,
      },
      "*::-webkit-scrollbar-track": { background: "transparent" },
    },
  },
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: { borderRadius: 10, paddingInline: 14, paddingBlock: 7, fontWeight: 600 },
      containedPrimary: { boxShadow: "0 1px 2px rgba(0,0,0,0.06)" },
      sizeSmall: { paddingInline: 10, paddingBlock: 4, fontSize: "0.8125rem" },
    },
  },
  MuiIconButton: {
    styleOverrides: { root: { borderRadius: 8 } },
  },
  MuiTextField: {
    defaultProps: { variant: "outlined", size: "small" },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: { borderRadius: 10 },
    },
  },
  MuiPaper: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      rounded: { borderRadius: 14 },
      outlined: { borderColor: mode === "dark" ? "rgba(148,163,184,0.16)" : "rgba(17,24,39,0.08)" },
    },
  },
  MuiCard: {
    defaultProps: { variant: "outlined" },
    styleOverrides: { root: { borderRadius: 14 } },
  },
  MuiChip: {
    styleOverrides: {
      root: { borderRadius: 8, fontWeight: 500 },
      sizeSmall: { height: 22, fontSize: "0.72rem" },
    },
  },
  MuiTooltip: {
    styleOverrides: {
      tooltip: { fontSize: "0.75rem", padding: "6px 10px", borderRadius: 8 },
    },
  },
  MuiDialog: {
    styleOverrides: { paper: { borderRadius: 16 } },
  },
  MuiMenu: {
    styleOverrides: { paper: { borderRadius: 12, marginTop: 4 } },
  },
  MuiTableCell: {
    styleOverrides: {
      head: { fontWeight: 600, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em" },
    },
  },
  MuiDataGrid: {
    styleOverrides: {
      root: {
        border: "none",
        borderRadius: 14,
        "--DataGrid-containerBackground": mode === "dark" ? "#0f172a" : "#f8fafc",
      },
      columnHeaders: {
        backgroundColor: mode === "dark" ? "#0f172a" : "#f8fafc",
        fontWeight: 600,
      },
      columnHeaderTitle: { fontWeight: 600, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em" },
      cell: { borderColor: mode === "dark" ? "rgba(148,163,184,0.12)" : "rgba(17,24,39,0.06)" },
      row: {
        "&:hover": { backgroundColor: mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(17,24,39,0.03)" },
      },
      footerContainer: { borderTop: "1px solid", borderColor: "divider" },
    },
  },
  MuiLinearProgress: {
    styleOverrides: { root: { borderRadius: 999, height: 6 } },
  },
});
