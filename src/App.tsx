import { useState, useEffect } from "react";
import { App, ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { RouterProvider } from "react-router-dom";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import useTheme from "@/hooks/useTheme.ts";
import useSyncFont from "@/hooks/useSyncFont.ts";
import useSyncTheme from "@/hooks/useSyncTheme";
import { router } from "@/router.tsx";
import { useItemUpdateListener } from "@/hooks/useItemUpdateListener";
import useSyncSetting from "@/hooks/useSyncSetting";
import { WindowFocusContext } from "@/hooks/useWindowFocus";

import { on, off } from "@/electron";
const Application = () => {
  const { isDark } = useTheme();

  useSyncSetting();
  useItemUpdateListener();
  useSyncFont();
  useSyncTheme();

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

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        components: {
          Calendar: {
            fullBg: "transparent",
          },
        },
      }}
      locale={zhCN}
    >
      <WindowFocusContext.Provider value={isFocused}>
        <App
          style={{
            height: "100%",
            fontSize: "var(--font-size)",
            color: "var(--text-normal)",
          }}
        >
          <DndProvider backend={HTML5Backend}>
            <RouterProvider router={router} />
          </DndProvider>
        </App>
      </WindowFocusContext.Provider>
    </ConfigProvider>
  );
};

export default Application;
