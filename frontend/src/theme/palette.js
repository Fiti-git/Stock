// Minimal UI signature palette — green-teal primary, purple secondary, warm
// amber warnings, coral errors. Full spectrum per color with lighter / light /
// main / dark / darker tokens, matching Minimal's design language.

const common = {
  common: { black: "#000000", white: "#FFFFFF" },
};

const grey = {
  50:  "#FCFDFD",
  100: "#F9FAFB",
  200: "#F4F6F8",
  300: "#DFE3E8",
  400: "#C4CDD5",
  500: "#919EAB",
  600: "#637381",
  700: "#454F5B",
  800: "#1C252E",
  900: "#141A21",
};

export const lightPalette = {
  ...common,
  mode: "light",
  primary: {
    lighter:      "#C8FAD6",
    light:        "#5BE49B",
    main:         "#00A76F",
    dark:         "#007867",
    darker:       "#004B50",
    contrastText: "#FFFFFF",
  },
  secondary: {
    lighter:      "#EFD6FF",
    light:        "#C684FF",
    main:         "#8E33FF",
    dark:         "#5119B7",
    darker:       "#27097A",
    contrastText: "#FFFFFF",
  },
  info: {
    lighter:      "#CAFDF5",
    light:        "#61F3F3",
    main:         "#00B8D9",
    dark:         "#006C9C",
    darker:       "#003768",
    contrastText: "#FFFFFF",
  },
  success: {
    lighter:      "#D3FCD2",
    light:        "#77ED8B",
    main:         "#22C55E",
    dark:         "#118D57",
    darker:       "#065E49",
    contrastText: "#FFFFFF",
  },
  warning: {
    lighter:      "#FFF5CC",
    light:        "#FFD666",
    main:         "#FFAB00",
    dark:         "#B76E00",
    darker:       "#7A4100",
    contrastText: "#1C252E",
  },
  error: {
    lighter:      "#FFE9D5",
    light:        "#FFAC82",
    main:         "#FF5630",
    dark:         "#B71D18",
    darker:       "#7A0916",
    contrastText: "#FFFFFF",
  },
  grey,
  text: {
    primary:   grey[800],
    secondary: grey[600],
    disabled:  grey[500],
    sidebar:      grey[700],
    sidebarMuted: grey[500],
  },
  background: {
    paper:   "#FFFFFF",
    default: "#FFFFFF",
    neutral: grey[200],
    sidebar: "#FFFFFF",
    sidebarHover: "rgba(145,158,171,0.08)",
  },
  divider: "rgba(145,158,171,0.2)",
  action: {
    hover:             "rgba(145,158,171,0.08)",
    selected:          "rgba(145,158,171,0.16)",
    focus:             "rgba(145,158,171,0.24)",
    disabled:          "rgba(145,158,171,0.8)",
    disabledBackground:"rgba(145,158,171,0.24)",
    hoverOpacity:      0.08,
    disabledOpacity:   0.48,
    active:            grey[600],
  },
};

// Dark palette kept for future use — not activated per product decision (light-only).
export const darkPalette = {
  ...lightPalette,
  mode: "dark",
};
