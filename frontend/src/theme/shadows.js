// Softer, more modern elevation scale than MUI defaults.
const soft = (y, blur, alpha) =>
  `0px ${y}px ${blur}px 0px rgba(15,23,42,${alpha})`;

export const softShadows = [
  "none",
  soft(1, 2, 0.04),
  soft(2, 4, 0.05),
  soft(3, 6, 0.06),
  soft(4, 8, 0.07),
  soft(6, 12, 0.08),
  soft(8, 16, 0.09),
  soft(10, 20, 0.1),
  soft(12, 24, 0.11),
  soft(14, 28, 0.12),
  soft(16, 32, 0.12),
  soft(18, 36, 0.13),
  soft(20, 40, 0.13),
  soft(22, 44, 0.14),
  soft(24, 48, 0.14),
  soft(26, 52, 0.15),
  soft(28, 56, 0.15),
  soft(30, 60, 0.16),
  soft(32, 64, 0.16),
  soft(34, 68, 0.17),
  soft(36, 72, 0.17),
  soft(38, 76, 0.18),
  soft(40, 80, 0.18),
  soft(42, 84, 0.19),
  soft(44, 88, 0.2),
];
