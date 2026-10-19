import { createContext, useContext, type ReactNode } from "react";

/** 重建界面使用的软件主题族（@tau/themes 的 key：paper / ocean / ink / mint / wisteria / sakura） */
const AppThemeContext = createContext("paper");

export function AppThemeProvider({ theme, children }: { theme: string; children: ReactNode }) {
  return <AppThemeContext.Provider value={theme}>{children}</AppThemeContext.Provider>;
}

export const useAppTheme = () => useContext(AppThemeContext);
