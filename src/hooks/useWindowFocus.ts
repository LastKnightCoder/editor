import { on, off } from "@/electron";
import { useEffect, useState } from "react";

export const useWindowFocus = () => {
  const [isFocused, setIsFocused] = useState(true);

  useEffect(() => {
    const handleWindowFocus = () => {
      setIsFocused(true);
    };

    const handleWindowBlur = () => {
      setIsFocused(false);
    };
    on("window-focus", handleWindowFocus);
    on("window-blur", handleWindowBlur);

    return () => {
      off("window-focus", handleWindowFocus);
      off("window-blur", handleWindowBlur);
    };
  }, []);

  return isFocused;
};
