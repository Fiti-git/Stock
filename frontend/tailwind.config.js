/** @type {import('tailwindcss').Config} */
// Tailwind is retained for layout/spacing utilities only.
// Colors, typography, and component styling come from the MUI theme (src/theme/).
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  corePlugins: {
    preflight: false, // let MUI CssBaseline handle base resets
  },
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
        },
      },
    },
  },
  plugins: [],
};
