import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { createDomThemeService, type EditorThemeMode, type ThemeService } from "./ThemeService";

/**
 * 编辑器主题的 React 入口。明暗与 token 统一由 ThemeService 提供，取用顺序：
 * 最近一层 EditorThemeOverride / 外层编辑器 → 服务注册表的 IThemeService → DOM 默认实现
 * （读 <html> 的 data-mode / data-theme）。
 *
 * 局部强制明暗（白板思维导图节点、导出预览等自带底色的容器）用 <EditorThemeOverride mode>
 * 包住编辑器；编辑器发现生效明暗与 <html> 不同时，在根节点补 data-theme + data-mode，
 * 让 --tau-* 数据块在子树重算。嵌套编辑器经同一个 Context 继承。
 */
const EditorThemeContext = createContext<ThemeService | null>(null);

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

/** 当前作用域生效的主题服务：上下文 → 给定的注册服务 → DOM 默认实现 */
function useResolvedService(registered?: ThemeService): ThemeService {
  return useContext(EditorThemeContext) ?? registered ?? getDomService();
}

/** 固定明暗、其余（主题族、token、订阅）沿用外层服务 */
function forceMode(parent: ThemeService, mode: EditorThemeMode): ThemeService {
  return {
    mode,
    get themeKey() {
      return parent.themeKey;
    },
    token: word => parent.token(word),
    subscribe: listener => parent.subscribe(listener),
  };
}

/** 宿主用：让子树里的编辑器按给定明暗渲染，不跟随宿主；mode 缺省时不覆盖 */
export function EditorThemeOverride({
  mode,
  children,
}: {
  mode?: EditorThemeMode;
  children: ReactNode;
}) {
  const parent = useResolvedService();
  const service = useMemo(() => (mode ? forceMode(parent, mode) : parent), [parent, mode]);
  return <EditorThemeContext.Provider value={service}>{children}</EditorThemeContext.Provider>;
}

/** 编辑器内部用：确定本编辑器的主题服务，并告知根节点是否要补作用域属性 */
export function EditorThemeScope({
  service,
  children,
}: {
  /** 服务注册表里的 IThemeService；上下文里有服务时以上下文为准 */
  service?: ThemeService;
  children: (scope: { themeKey: string; mode: EditorThemeMode; overridden: boolean }) => ReactNode;
}) {
  const resolved = useResolvedService(service);
  const mode = useServiceMode(resolved);
  const dom = getDomService();
  const documentMode = useServiceMode(dom);
  return (
    <EditorThemeContext.Provider value={resolved}>
      {children({
        themeKey: resolved.themeKey || dom.themeKey,
        mode,
        overridden: mode !== documentMode,
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
  const service = useResolvedService();
  const mode = useServiceMode(service);
  return useMemo(
    () => ({ mode, isDark: mode === "dark", token: word => service.token(word) }),
    [mode, service]
  );
}
