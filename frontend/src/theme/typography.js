// Public Sans is Minimal's signature font. Loaded via @fontsource in main.jsx.

const pxToRem = (value) => `${value / 16}rem`;

const responsive = (sm, md, lg) => ({
  "@media (min-width:600px)":  { fontSize: pxToRem(sm) },
  "@media (min-width:900px)":  { fontSize: pxToRem(md) },
  "@media (min-width:1200px)": { fontSize: pxToRem(lg) },
});

export const typography = {
  fontFamily: [
    "Public Sans",
    "Inter",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "sans-serif",
  ].join(","),
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightSemiBold: 600,
  fontWeightBold: 700,

  h1: { fontWeight: 800, lineHeight: 1.14, fontSize: pxToRem(32), ...responsive(40, 48, 56) },
  h2: { fontWeight: 800, lineHeight: 1.22, fontSize: pxToRem(28), ...responsive(32, 40, 44) },
  h3: { fontWeight: 700, lineHeight: 1.28, fontSize: pxToRem(24), ...responsive(26, 30, 32) },
  h4: { fontWeight: 700, lineHeight: 1.4,  fontSize: pxToRem(20), ...responsive(20, 22, 24) },
  h5: { fontWeight: 700, lineHeight: 1.5,  fontSize: pxToRem(18), ...responsive(19, 19, 20) },
  h6: { fontWeight: 700, lineHeight: 1.55, fontSize: pxToRem(16), ...responsive(17, 18, 18) },
  subtitle1: { fontWeight: 600, lineHeight: 1.5, fontSize: pxToRem(16) },
  subtitle2: { fontWeight: 600, lineHeight: 22 / 14, fontSize: pxToRem(14) },
  body1:     { lineHeight: 1.5,        fontSize: pxToRem(16) },
  body2:     { lineHeight: 22 / 14,    fontSize: pxToRem(14) },
  caption:   { lineHeight: 1.5,        fontSize: pxToRem(12) },
  overline:  { fontWeight: 700, lineHeight: 1.5, fontSize: pxToRem(12), textTransform: "uppercase", letterSpacing: "0.08em" },
  button:    { fontWeight: 700, lineHeight: 24 / 14, fontSize: pxToRem(14), textTransform: "unset" },
};
