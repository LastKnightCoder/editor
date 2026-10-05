/**
 * 桌面 ↔ 浏览器扩展的主题同步协议（aiServer 通道）：只同步主题族 key，不同步明暗——
 * 扩展的深浅由扩展自己的偏好决定。
 */
export const APPEARANCE_METHODS = {
  /** 请求：读取桌面当前主题族 → { theme } */
  getTheme: "appearance.getTheme",
  /** 通知：桌面主题族变化 → { theme } */
  themeChanged: "appearance.themeChanged",
} as const;

export interface AppearanceThemePayload {
  theme: string;
}
