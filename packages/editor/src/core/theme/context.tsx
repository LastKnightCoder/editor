import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { createDomThemeService, type EditorThemeMode, type ThemeService } from "./ThemeService";

/**
 * 编辑器主题的 React 入口。明暗与 token 统一由 ThemeService 提供，取用顺序：
 * 最近一层 EditorThemeOverride / 外层编辑器 → 服务注册表的 IThemeService → DOM 默认实现
 * （读 <html> 的 data-mode / data-theme）。
 *
 * 局部强制明暗 / 主题族（白板思维导图节点、导出图片等自带底色的容器）用
 * <EditorThemeOverride mode themeKey> 包住编辑器；编辑器发现生效明暗或主题族与 <html> 不同时，
 * 在根节点补 data-theme + data-mode，让 --tau-* 数据块在子树重算。嵌套编辑器经同一个 Context 继承。
 */
const EditorThemeContext = createContext<ThemeService | null>(null);

let domService: ThemeService | undefined;
const getDomService = (): ThemeService => {
  if (!domService) domService = createDomThemeService();
  return domService;
};

/** 主题通知也可能只改 token，修订号让同明暗、同主题族的取色组件刷新。 */
function useServiceSnapshot(service: ThemeService) {
  const [subscribe, getSnapshot] = useMemo(() => {
    let revision = 0;
    let snapshot = { mode: service.mode, themeKey: service.themeKey, revision };
    return [
      (listener: () => void) =>
        service.subscribe(() => {
          revision += 1;
          listener();
        }),
      () => {
        if (
          snapshot.revision !== revision ||
          snapshot.mode !== service.mode ||
          snapshot.themeKey !== service.themeKey
        ) {
          snapshot = { mode: service.mode, themeKey: service.themeKey, revision };
        }
        return snapshot;
      },
    ] as const;
  }, [service]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 当前作用域生效的主题服务：上下文 → 给定的注册服务 → DOM 默认实现 */
function useResolvedService(registered?: ThemeService): ThemeService {
  return useContext(EditorThemeContext) ?? registered ?? getDomService();
}

/** 固定明暗和 / 或主题族，未给定的维度与 token、订阅沿用外层服务 */
function forceTheme(
  parent: ThemeService,
  override: { mode?: EditorThemeMode; themeKey?: string }
): ThemeService {
  return {
    get mode() {
      return override.mode ?? parent.mode;
    },
    get themeKey() {
      return override.themeKey ?? parent.themeKey;
    },
    token: word => parent.token(word),
    subscribe: listener => parent.subscribe(listener),
  };
}

/** 宿主用：让子树里的编辑器按给定明暗 / 主题族渲染，不跟随宿主；缺省的维度不覆盖 */
export function EditorThemeOverride({
  mode,
  themeKey,
  children,
}: {
  mode?: EditorThemeMode;
  themeKey?: string;
  children: ReactNode;
}) {
  const parent = useResolvedService();
  const service = useMemo(
    () => (mode || themeKey ? forceTheme(parent, { mode, themeKey }) : parent),
    [parent, mode, themeKey]
  );
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
  const { mode, themeKey } = useServiceSnapshot(resolved);
  const dom = getDomService();
  const { mode: documentMode, themeKey: documentThemeKey } = useServiceSnapshot(dom);
  return (
    <EditorThemeContext.Provider value={resolved}>
      {children({
        themeKey: themeKey || documentThemeKey,
        mode,
        overridden: mode !== documentMode || (!!themeKey && themeKey !== documentThemeKey),
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
  const snapshot = useServiceSnapshot(service);
  return useMemo(
    () => ({
      mode: snapshot.mode,
      isDark: snapshot.mode === "dark",
      token: word => service.token(word),
    }),
    [service, snapshot]
  );
}
