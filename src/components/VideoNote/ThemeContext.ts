import { createContext, useContext } from "react";

export const ThemeContext = createContext<"light" | "dark">("light");

export const useTheme = () => {
  return useContext(ThemeContext);
};
