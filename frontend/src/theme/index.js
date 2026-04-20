import { createTheme } from "@mui/material/styles";
import { lightPalette, darkPalette } from "./palette";
import { typography } from "./typography";
import { softShadows, customShadows } from "./shadows";
import { componentOverrides } from "./components";

export function buildTheme(mode = "light") {
  const palette = mode === "dark" ? darkPalette : lightPalette;

  const colorMains = {
    primary:   palette.primary.main,
    secondary: palette.secondary.main,
    info:      palette.info.main,
    success:   palette.success.main,
    warning:   palette.warning.main,
    error:     palette.error.main,
  };
  const customShadowValues = customShadows(colorMains);

  return createTheme({
    palette,
    typography,
    shape: { borderRadius: 8 },
    shadows: softShadows,
    customShadows: customShadowValues,
    components: componentOverrides(mode, palette, customShadowValues),
  });
}
