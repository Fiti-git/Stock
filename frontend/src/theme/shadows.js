// Minimal-style soft neutral shadows. Exact hex/opacity taken from Minimal's
// shadow scale (grey-500 @ low alpha) — gives the signature floating-card
// feel without the heavy grey cast MUI defaults produce.

const SHADOW_COLOR = "145 158 171"; // grey.500 channel — rgb without commas

const make = (y1, b1, a1, y2, b2, a2) =>
  `0 ${y1}px ${b1}px 0 rgb(${SHADOW_COLOR} / ${a1}),` +
  `0 ${y2}px ${b2}px -2px rgb(${SHADOW_COLOR} / ${a2})`;

export const softShadows = [
  "none",
  make(1,  2,  0.16, 1,  3,  0.10),
  make(2,  4,  0.16, 2,  4,  0.10),
  make(3,  6,  0.16, 3,  6,  0.10),
  make(4,  8,  0.16, 4,  8,  0.10),
  make(6, 12,  0.16, 6, 12,  0.10),
  make(8, 16,  0.16, 8, 16,  0.10),
  make(10, 20, 0.16, 10, 20, 0.10),
  make(12, 24, 0.16, 12, 24, 0.10),
  make(14, 28, 0.16, 14, 28, 0.10),
  make(16, 32, 0.16, 16, 32, 0.10),
  make(18, 36, 0.16, 18, 36, 0.10),
  make(20, 40, 0.16, 20, 40, 0.10),
  make(22, 44, 0.16, 22, 44, 0.10),
  make(24, 48, 0.16, 24, 48, 0.10),
  make(26, 52, 0.16, 26, 52, 0.10),
  make(28, 56, 0.16, 28, 56, 0.10),
  make(30, 60, 0.16, 30, 60, 0.10),
  make(32, 64, 0.16, 32, 64, 0.10),
  make(34, 68, 0.16, 34, 68, 0.10),
  make(36, 72, 0.16, 36, 72, 0.10),
  make(38, 76, 0.16, 38, 76, 0.10),
  make(40, 80, 0.16, 40, 80, 0.10),
  make(42, 84, 0.16, 42, 84, 0.10),
  make(44, 88, 0.16, 44, 88, 0.10),
];

// Custom shadows extend the theme — cards, dialogs, dropdowns, and colored
// button glows. Consumed via `theme.customShadows.<name>`.
export const customShadows = ({ primary, secondary, info, success, warning, error }) => ({
  z1:  make(1,  2,  0.16, 1,  3,  0.10),
  z4:  make(4,  8,  0.16, 4,  8,  0.10),
  z8:  make(8, 16,  0.16, 8, 16,  0.10),
  z12: make(12, 24, 0.16, 12, 24, 0.10),
  z16: make(16, 32, 0.16, 16, 32, 0.10),
  z20: make(20, 40, 0.16, 20, 40, 0.10),
  z24: make(24, 48, 0.16, 24, 48, 0.10),
  card:     make(1, 2, 0.16, 0, 0, 0),
  dropdown: make(0, 0, 0, 20, 40, 0.24),
  dialog:   make(0, 0, 0, 40, 80, 0.24),
  primary:   `0 8px 16px 0 ${primary}52`,
  secondary: `0 8px 16px 0 ${secondary}52`,
  info:      `0 8px 16px 0 ${info}52`,
  success:   `0 8px 16px 0 ${success}52`,
  warning:   `0 8px 16px 0 ${warning}52`,
  error:     `0 8px 16px 0 ${error}52`,
});
