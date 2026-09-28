import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { createDomThemeService, type EditorThemeMode, type ThemeService } from "./ThemeService";

/**
 * 编辑器主题的 React 入口。宿主可经服务注册表注入 ThemeService（IThemeService）；
 * 未注入时用 DOM 默认实现，读 <html> 的 data-mode / data-theme。
 *
 * 局部强制明暗（白板思维导图节点、闪卡预览等自带深底的容器）经 <Editor theme> 传入，
 * 由 EditorThemeScope 在编辑器根节点补 data-theme + data-mode，让 --tau-* 数据块在子树重算。
 */
interface EditorThemeValue {
  mode: EditorThemeMode;
  service: ThemeService;
}

const EditorThemeContext = createContext<EditorThemeValue | null>(null);

let domService: ThemeService | undefined;
const getDomService = (): ThemeService => {
  if (!domService) domService = createDomThemeService();
  return domService;
};

/** 订阅 ThemeService 的明暗；service 变化时重新订阅 */
function useServiceMode(service: ThemeService): EditorThemeMode {
  const [subscribe, getSnapshot] = useMemo(
    () => [(listener: () => void) => service.subscribe(listener), () => service.mode] as const,
    [service]
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => service.mode);
}

export function EditorThemeScope({
  service,
  mode,
  children,
}: {
  /** 宿主注入的服务；缺省用 DOM 实现 */
  service?: ThemeService;
  /** 显式明暗（`<Editor theme>`），给定时覆盖服务的明暗 */
  mode?: EditorThemeMode;
  children: (scope: { themeKey: string; mode: EditorThemeMode; overridden: boolean }) => ReactNode;
}) {
  const resolvedService = service ?? getDomService();
  const serviceMode = useServiceMode(resolvedService);
  const effectiveMode = mode ?? serviceMode;
  const value = useMemo<EditorThemeValue>(
    () => ({ mode: effectiveMode, service: resolvedService }),
    [effectiveMode, resolvedService]
  );
  return (
    <EditorThemeContext.Provider value={value}>
      {children({
        themeKey: resolvedService.themeKey,
        mode: effectiveMode,
        overridden: mode !== undefined && mode !== serviceMode,
      })}
    </EditorThemeContext.Provider>
  );
}

export interface EditorTheme {
  mode: EditorThemeMode;
  isDark: boolean;
  /** 读取 token 实际取值，给 mermaid / shiki / canvas 这类需要色值的渲染器用 */
  token: (word: string) => string;
}

/** 编辑器内部读主题：明暗 + token 取值。未挂载 Editor 时回落 DOM 实现。 */
export function useEditorTheme(): EditorTheme {
  const context = useContext(EditorThemeContext);
  const fallback = getDomService();
  const service = context?.service ?? fallback;
  const serviceMode = useServiceMode(service);
  const mode = context?.mode ?? serviceMode;
  return useMemo(
    () => ({ mode, isDark: mode === "dark", token: word => service.token(word) }),
    [mode, service]
  );
}
