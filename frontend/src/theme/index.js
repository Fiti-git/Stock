import { createTheme } from "@mui/material/styles";
import { lightPalette, darkPalette } from "./palette";
import { typography } from "./typography";
import { softShadows } from "./shadows";
import { componentOverrides } from "./components";

export function buildTheme(mode = "light") {
  const palette = mode === "dark" ? darkPalette : lightPalette;
  return createTheme({
    palette,
    typography,
    shape: { borderRadius: 10 },
    shadows: softShadows,
    components: componentOverrides(mode),
  });
}
