// Palette tokens — swap hex values here to rebrand the app.
// Structure is stable; only colors change.

const common = {
  common: { black: "#000", white: "#fff" },
};

export const lightPalette = {
  ...common,
  mode: "light",
  primary: {
    main: "#15803d",
    light: "#22c55e",
    dark: "#14532d",
    contrastText: "#fff",
  },
  secondary: {
    main: "#0ea5e9",
    light: "#38bdf8",
    dark: "#0369a1",
    contrastText: "#fff",
  },
  error:   { main: "#dc2626", light: "#ef4444", dark: "#991b1b", contrastText: "#fff" },
  warning: { main: "#d97706", light: "#f59e0b", dark: "#92400e", contrastText: "#fff" },
  info:    { main: "#2563eb", light: "#3b82f6", dark: "#1e40af", contrastText: "#fff" },
  success: { main: "#16a34a", light: "#22c55e", dark: "#15803d", contrastText: "#fff" },
  grey: {
    50:  "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },
  background: {
    default: "#f7f8fa",
    paper: "#ffffff",
    sidebar: "#0f172a",
    sidebarHover: "#1e293b",
  },
  text: {
    primary: "#111827",
    secondary: "#4b5563",
    disabled: "#9ca3af",
    sidebar: "#e2e8f0",
    sidebarMuted: "#94a3b8",
  },
  divider: "rgba(17,24,39,0.08)",
  action: {
    hover: "rgba(17,24,39,0.04)",
    selected: "rgba(21,128,61,0.08)",
  },
};

export const darkPalette = {
  ...common,
  mode: "dark",
  primary: {
    main: "#22c55e",
    light: "#4ade80",
    dark: "#15803d",
    contrastText: "#052e16",
  },
  secondary: {
    main: "#38bdf8",
    light: "#7dd3fc",
    dark: "#0369a1",
    contrastText: "#0c1220",
  },
  error:   { main: "#f87171", light: "#fca5a5", dark: "#b91c1c", contrastText: "#1a0606" },
  warning: { main: "#fbbf24", light: "#fcd34d", dark: "#b45309", contrastText: "#1a1100" },
  info:    { main: "#60a5fa", light: "#93c5fd", dark: "#1d4ed8", contrastText: "#081022" },
  success: { main: "#4ade80", light: "#86efac", dark: "#166534", contrastText: "#052e16" },
  grey: {
    50:  "#18212f",
    100: "#1e293b",
    200: "#273449",
    300: "#334155",
    400: "#475569",
    500: "#64748b",
    600: "#94a3b8",
    700: "#cbd5e1",
    800: "#e2e8f0",
    900: "#f1f5f9",
  },
  background: {
    default: "#0b1220",
    paper: "#111a2e",
    sidebar: "#0a101c",
    sidebarHover: "#16213a",
  },
  text: {
    primary: "#f1f5f9",
    secondary: "#94a3b8",
    disabled: "#64748b",
    sidebar: "#e2e8f0",
    sidebarMuted: "#94a3b8",
  },
  divider: "rgba(148,163,184,0.16)",
  action: {
    hover: "rgba(255,255,255,0.04)",
    selected: "rgba(34,197,94,0.12)",
  },
};
