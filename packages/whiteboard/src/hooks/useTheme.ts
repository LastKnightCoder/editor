import { useThemeStore } from "@tau/themes/react";
export default function useTheme() {
  return { isDark: useThemeStore(s => s.mode) === "dark" };
}
