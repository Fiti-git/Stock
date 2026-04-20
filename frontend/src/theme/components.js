// Component-level overrides that give MUI the Minimal look. All existing
// pages pick these up automatically — no code changes needed at the call
// site for buttons, cards, chips, inputs, tables, dialogs.

export const componentOverrides = (mode, palette, customShadows) => ({
  MuiCssBaseline: {
    styleOverrides: {
      "*": { boxSizing: "border-box" },
      html: {
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        textRendering: "optimizeLegibility",
      },
      body: {
        backgroundColor: palette.background.default,
        fontFeatureSettings: '"ss01","cv11"',
      },
      "*::-webkit-scrollbar": { width: 10, height: 10 },
      "*::-webkit-scrollbar-thumb": {
        background: palette.grey[300],
        borderRadius: 8,
      },
      "*::-webkit-scrollbar-thumb:hover": { background: palette.grey[400] },
      "*::-webkit-scrollbar-track": { background: "transparent" },
    },
  },

  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: {
        borderRadius: 8,
        fontWeight: 700,
        paddingInline: 16,
        paddingBlock: 8,
      },
      sizeSmall: { paddingInline: 10, paddingBlock: 4, fontSize: "0.8125rem" },
      sizeLarge: { paddingInline: 20, paddingBlock: 12, fontSize: "0.9375rem" },
      containedPrimary:  { boxShadow: customShadows.primary },
      containedSecondary:{ boxShadow: customShadows.secondary },
      containedInfo:     { boxShadow: customShadows.info },
      containedSuccess:  { boxShadow: customShadows.success },
      containedWarning:  { boxShadow: customShadows.warning },
      containedError:    { boxShadow: customShadows.error },
      outlined: { borderColor: palette.grey[300] },
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
      root: {
        borderRadius: 8,
        "& fieldset": { borderColor: palette.grey[300] },
        "&:hover fieldset": { borderColor: `${palette.grey[400]} !important` },
      },
    },
  },

  MuiInputLabel: {
    styleOverrides: { root: { fontSize: "0.875rem" } },
  },

  MuiPaper: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      rounded: { borderRadius: 16 },
      outlined: { borderColor: palette.divider },
      elevation1: { boxShadow: customShadows.card },
    },
  },

  MuiCard: {
    defaultProps: { variant: "elevation", elevation: 0 },
    styleOverrides: {
      root: {
        borderRadius: 16,
        position: "relative",
        boxShadow: customShadows.card,
        zIndex: 0,
      },
    },
  },

  MuiCardHeader: {
    defaultProps: { titleTypographyProps: { variant: "h6" }, subheaderTypographyProps: { variant: "body2" } },
    styleOverrides: { root: { padding: "24px 24px 0" } },
  },

  MuiCardContent: {
    styleOverrides: { root: { padding: 24, "&:last-child": { paddingBottom: 24 } } },
  },

  MuiChip: {
    styleOverrides: {
      root: { borderRadius: 8, fontWeight: 600 },
      sizeSmall: { height: 24, fontSize: "0.75rem" },
    },
  },

  MuiTooltip: {
    styleOverrides: {
      tooltip: {
        backgroundColor: palette.grey[800],
        fontSize: "0.75rem",
        padding: "6px 10px",
        borderRadius: 8,
      },
      arrow: { color: palette.grey[800] },
    },
  },

  MuiDialog: {
    styleOverrides: {
      paper: { borderRadius: 16, boxShadow: customShadows.dialog },
    },
  },

  MuiDialogTitle: {
    styleOverrides: { root: { fontWeight: 700, fontSize: "1.125rem" } },
  },

  MuiMenu: {
    styleOverrides: {
      paper: { borderRadius: 10, marginTop: 4, boxShadow: customShadows.dropdown },
    },
  },

  MuiMenuItem: {
    styleOverrides: {
      root: {
        borderRadius: 6,
        marginInline: 4,
        marginBlock: 2,
        "&:hover": { backgroundColor: palette.action.hover },
      },
    },
  },

  MuiTableCell: {
    styleOverrides: {
      head: {
        fontWeight: 700,
        fontSize: "0.75rem",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: palette.text.secondary,
        backgroundColor: palette.grey[100],
      },
    },
  },

  MuiDataGrid: {
    styleOverrides: {
      root: {
        border: "none",
        borderRadius: 16,
        "--DataGrid-containerBackground": palette.grey[100],
      },
      columnHeaders: { backgroundColor: palette.grey[100] },
      columnHeaderTitle: {
        fontWeight: 700,
        fontSize: "0.72rem",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: palette.text.secondary,
      },
      cell: { borderColor: palette.divider },
      row: {
        "&:hover": { backgroundColor: palette.action.hover },
      },
      footerContainer: { borderTop: "1px solid", borderColor: "divider" },
    },
  },

  MuiTabs: {
    styleOverrides: {
      indicator: { height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
    },
  },

  MuiTab: {
    styleOverrides: {
      root: { fontWeight: 600, textTransform: "none", minHeight: 44 },
    },
  },

  MuiLinearProgress: {
    styleOverrides: { root: { borderRadius: 999, height: 6 } },
  },

  MuiAvatar: {
    styleOverrides: {
      root: { fontWeight: 600 },
    },
  },

  MuiAppBar: {
    defaultProps: { elevation: 0, color: "inherit" },
    styleOverrides: {
      root: {
        backgroundColor: "rgba(255,255,255,0.8)",
        backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${palette.divider}`,
      },
    },
  },
});
