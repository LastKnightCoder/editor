import type { ComponentType } from "react";
import type { Disposable } from "./contract";
import type { JsonValue } from "./json";
import type { PluginPageParams } from "./pages";

export type PluginWindowParams = PluginPageParams;

export type PluginWindowOptions = (
  | { kind: "normal"; width: number; height: number }
  | { kind: "compact"; width: number; height: number; alwaysOnTop?: boolean }
  | { kind: "fullscreen" }
) & { theme?: "system" | "dark" };

export interface PluginWindowDefinition {
  readonly id: string;
  readonly title: string;
  readonly component: ComponentType<PluginWindowProps>;
  readonly options: PluginWindowOptions;
}

export interface PluginWindowProps {
  readonly params: Readonly<PluginWindowParams>;
  readonly signal: AbortSignal;
  readonly close: () => Promise<void>;
  readonly communication: PluginWindowCommunication;
}

export interface PluginWindowHandle {
  close(): Promise<void>;
}

export interface PluginWindows {
  readonly communication: PluginWindowCommunication;
  open(id: string, params?: PluginWindowParams): Promise<PluginWindowHandle>;
}

export interface PluginWindowAppearance {
  readonly themeId: string;
  readonly appearance: "system" | "light" | "dark";
  readonly mode: "light" | "dark";
  readonly font: {
    readonly chineseFont: string;
    readonly englishFont: string;
    readonly codeFont: string;
    readonly fontSize: number;
  };
}

export type PluginWindowMessageSender =
  | { readonly kind: "main" }
  | { readonly kind: "window"; readonly windowId: string };

export type PluginWindowMessageTarget = "all" | "main" | { readonly windowId: string };

export interface PluginWindowCommunication {
  /** 窗口已继承宿主外观，自绘内容可读取或订阅。 */
  readonly system: {
    get(key: "system.appearance"): PluginWindowAppearance;
    subscribe(
      key: "system.appearance",
      listener: (value: PluginWindowAppearance) => void
    ): Disposable;
  };
  readonly state: {
    get(key: string): Promise<JsonValue | undefined>;
    set(key: string, value: JsonValue): Promise<void>;
    /** 首次回调交付当前状态，后续回调交付更新。 */
    subscribe(key: string, listener: (value: JsonValue | undefined) => void): Promise<Disposable>;
  };
  readonly messages: {
    /** 返回提交投递的在线端点数量。 */
    send(name: string, payload: JsonValue, target: PluginWindowMessageTarget): Promise<number>;
    on(
      name: string,
      listener: (payload: JsonValue, sender: PluginWindowMessageSender) => void
    ): Disposable;
  };
}
