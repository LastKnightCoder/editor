import { useContext, useMemo } from "react";
import { EditorContext } from "../index.tsx";

const useTheme = () => {
  const { theme } = useContext(EditorContext);

  const isDark = useMemo(() => {
    return theme === "dark";
  }, [theme]);

  return {
    theme,
    isDark,
  };
};

export default useTheme;
