import { useState, useEffect } from "react";
import { App, ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { RouterProvider } from "react-router-dom";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import useTheme from "@/hooks/useTheme.ts";
import useSyncFont from "@/hooks/useSyncFont.ts";
import useSyncTheme from "@/hooks/useSyncTheme";
import useSyncTwoToneColor from "@/hooks/useSyncTwoToneColor";
import { useItemUpdateListener } from "@/hooks/useItemUpdateListener";
import useSyncSetting from "@/hooks/useSyncSetting";
import { WindowFocusContext } from "@/hooks/useWindowFocus";
import useAntdThemeToken from "@/hooks/useAntdThemeToken";

import { on, off } from "@/electron";

import { router } from "@/router.tsx";

const Application = () => {
  const { isDark } = useTheme();
  const { token, isSolid, overlayTokens } = useAntdThemeToken();

  useSyncSetting();
  useItemUpdateListener();
  useSyncFont();
  useSyncTheme();
  useSyncTwoToneColor();

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
        token,
        components: {
          Calendar: {
            fullBg: "transparent",
          },
          Table: {
            headerBg: isSolid
              ? isDark
                ? "#1f1f1f"
                : "#fafafa"
              : isDark
                ? "rgba(0, 0, 0, 0.2)"
                : "rgba(255, 255, 255, 0.6)",
            rowHoverBg: isSolid
              ? isDark
                ? "#262626"
                : "#f5f5f5"
              : isDark
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(0, 0, 0, 0.02)",
            headerSortActiveBg: isSolid
              ? isDark
                ? "#262626"
                : "#f0f0f0"
              : isDark
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(0, 0, 0, 0.04)",
            headerFilterHoverBg: isSolid
              ? isDark
                ? "#333333"
                : "#e5e5e5"
              : isDark
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(0, 0, 0, 0.06)",
          },
          Button: {
            primaryShadow: "none",
            defaultShadow: "none",
            dangerShadow: "none",
            defaultBg: isSolid
              ? isDark
                ? "#262626"
                : "#ffffff"
              : isDark
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(255, 255, 255, 0.8)",
            defaultBorderColor: isSolid
              ? isDark
                ? "#424242"
                : "#d9d9d9"
              : isDark
                ? "rgba(255, 255, 255, 0.2)"
                : "rgba(0, 0, 0, 0.15)",
            defaultHoverBg: isSolid
              ? isDark
                ? "#333333"
                : "#f5f5f5"
              : isDark
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(255, 255, 255, 0.9)",
            defaultHoverBorderColor: isSolid
              ? isDark
                ? "#525252"
                : "#b3b3b3"
              : isDark
                ? "rgba(255, 255, 255, 0.3)"
                : "rgba(0, 0, 0, 0.2)",
          },
          Select: {
            optionSelectedBg: isSolid
              ? isDark
                ? "#262626"
                : "#f0f0f0"
              : isDark
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(0, 0, 0, 0.04)",
            selectorBg: isSolid
              ? isDark
                ? "#1f1f1f"
                : "#ffffff"
              : isDark
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(255, 255, 255, 0.8)",
            optionActiveBg: isSolid
              ? isDark
                ? "#333333"
                : "#e6e6e6"
              : isDark
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(0, 0, 0, 0.06)",
          },
          Pagination: {
            itemBg: isSolid
              ? "transparent"
              : isDark
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(255, 255, 255, 0.6)",
            itemActiveBg: isSolid
              ? isDark
                ? "#262626"
                : "#ffffff"
              : isDark
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(255, 255, 255, 0.9)",
            itemInputBg: isSolid
              ? isDark
                ? "#1f1f1f"
                : "#ffffff"
              : isDark
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(255, 255, 255, 0.8)",
          },
          Input: {
            activeShadow: "none",
            activeBg: isSolid
              ? isDark
                ? "#1f1f1f"
                : "#ffffff"
              : isDark
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(255, 255, 255, 0.9)",
            hoverBg: isSolid
              ? isDark
                ? "#262626"
                : "#ffffff"
              : isDark
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(255, 255, 255, 0.85)",
          },
          Modal: {
            contentBg: isSolid
              ? isDark
                ? "#1f1f1f"
                : "#ffffff"
              : isDark
                ? "rgba(20, 20, 20, 0.95)"
                : "rgba(255, 255, 255, 0.95)",
            headerBg: "transparent",
          },
          Dropdown: {
            colorBgElevated: overlayTokens.background,
            colorBorder: overlayTokens.borderColor,
            colorSplit: overlayTokens.borderColor,
            colorText: overlayTokens.textColor,
            colorTextDescription: overlayTokens.secondaryTextColor,
            boxShadowSecondary: overlayTokens.dropdownShadow,
            controlItemBgHover: overlayTokens.hoverBackground,
            controlItemBgActive: overlayTokens.activeBackground,
            controlItemBgActiveHover: overlayTokens.activeBackground,
          },
          Popover: {
            colorBgElevated: overlayTokens.background,
            colorText: overlayTokens.textColor,
            colorTextDescription: overlayTokens.secondaryTextColor,
            colorTextHeading: overlayTokens.textColor,
            colorSplit: overlayTokens.borderColor,
            boxShadowSecondary: overlayTokens.shadow,
          },
          Tooltip: {
            colorBgSpotlight: isDark ? "#1f1f1f" : "#ffffff",
            colorTextLightSolid: isDark ? "#e5e5e5" : "#262626",
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
