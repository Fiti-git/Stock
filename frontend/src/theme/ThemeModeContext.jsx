import { createContext, useContext, useMemo, useState, useEffect } from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { buildTheme } from "./index";

const ThemeModeContext = createContext({ mode: "light", toggleMode: () => {} });

const STORAGE_KEY = "theme-mode";

export function ThemeModeProvider({ children }) {
  // Locked to light for now — dark palette is kept in the theme layer and can
  // be re-enabled by unlocking this state without touching any page code.
  const [mode] = useState("light");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const value = useMemo(
    () => ({ mode, toggleMode: () => {}, setMode: () => {} }),
    [mode]
  );

  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export const useThemeMode = () => useContext(ThemeModeContext);
