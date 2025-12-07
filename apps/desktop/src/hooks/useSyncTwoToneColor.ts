import { useEffect } from "react";
import { setTwoToneColor } from "@ant-design/icons";

import useThemeColors from "./useThemeColors";

const useSyncTwoToneColor = () => {
  const { twoToneColor } = useThemeColors();

  useEffect(() => {
    if (!twoToneColor) return;
    setTwoToneColor(twoToneColor);
  }, [twoToneColor]);
};

export default useSyncTwoToneColor;
