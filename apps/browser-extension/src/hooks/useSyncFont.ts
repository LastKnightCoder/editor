import { useEffect } from "react";
import type WebSocketClient from "../utils/WebSocketClient";

/**
 * 字体设置结构，与 desktop useSettingStore 的 fontSetting 对齐
 */
interface FontSetting {
  chineseFont: string;
  englishFont: string;
  fontSize: number;
  codeFont: string;
}

interface AppearanceSetting {
  backgroundType?: string;
}

const DEFAULT_ACCENT = "solid";

/**
 * 将字体设置应用到 document.body 的 CSS 变量
 * 对齐 desktop useSyncFont.ts 的逻辑
 */
function applyFontSetting(fontSetting: FontSetting) {
  const { chineseFont, englishFont, fontSize, codeFont } = fontSetting;
  const font = `${englishFont}, ${chineseFont}`;
  document.body.style.setProperty("--font", font);
  document.body.style.setProperty("--font-size", `${fontSize}px`);
  document.body.style.setProperty(
    "--mono-font",
    `${codeFont}, ${font}, monospace`,
  );
}

function applyAppearanceSetting(appearance?: AppearanceSetting) {
  document.documentElement.dataset.accent =
    appearance?.backgroundType || DEFAULT_ACCENT;
}

/**
 * 通过 WebSocket RPC 获取客户端外观设置并同步到 CSS 变量
 *
 * - 连接成功后调用 "get-user-setting" 获取完整设置
 * - 监听 "user-setting-changed" 通知，实时同步字体和主题强调色
 * - 与 desktop 的 useSyncFont + useSyncTheme 行为一致
 */
export function useSyncFont(wsClient: WebSocketClient | null) {
  useEffect(() => {
    applyAppearanceSetting();

    if (!wsClient?.isConnected) return;

    const extractAndApplyAppearance = (setting: Record<string, unknown>) => {
      const fontSetting = setting?.fontSetting as FontSetting | undefined;
      if (fontSetting) {
        applyFontSetting(fontSetting);
      }

      applyAppearanceSetting(setting?.appearance as AppearanceSetting);
    };

    // 初始化：获取当前设置
    wsClient
      .sendRequest("get-user-setting", null)
      .then((result) => {
        if (result && typeof result === "object") {
          extractAndApplyAppearance(result as Record<string, unknown>);
        }
      })
      .catch((err) => {
        console.warn("[Tau Extension] 获取外观设置失败:", err);
      });

    // 监听设置变更通知
    const handleSettingChanged = (data: unknown) => {
      if (data && typeof data === "object") {
        const payload = data as { setting?: Record<string, unknown> };
        if (payload.setting) {
          extractAndApplyAppearance(payload.setting);
        }
      }
    };

    wsClient.registerNotificationHandler(
      "user-setting-changed",
      handleSettingChanged,
    );

    return () => {
      wsClient.unregisterNotificationHandler(
        "user-setting-changed",
        handleSettingChanged,
      );
    };
  }, [wsClient]);
}
