import { useContext } from "react";
import { EditorContext } from "@/components/Editor";

const useTheme = () => {
  const { theme } = useContext(EditorContext);
  return {
    isDark: theme === "dark",
    theme,
  };
};

export default useTheme;
