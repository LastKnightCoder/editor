import type { Root } from "react-dom/client";
import * as SharedReact from "react";
import * as SharedReactDOM from "react-dom/client";
import * as SharedUi from "@tau/ui";
import type { PluginRuntimeStyleCompiler as RuntimeStyleCompiler } from "@tau/plugins";

/** 宿主传入的主题：明暗 + 按 token 词取当前计算值（`accent` 取 --ed-accent，缺省回落 --tau-accent） */
export interface CustomBlockTheme {
  isDark: boolean;
  token: (word: string) => string;
}

/** 模板经 useTokens() 拿到的主题 */
interface TemplateTheme {
  isDark: boolean;
  color: (word: string) => string;
}

const CUSTOM_BLOCK_ROOT_KEY = "__customBlockRoot__";
const CUSTOM_BLOCK_RUNTIME_KEY = "__customBlockRuntime__";
// 编译未完成时暂存最新主题，由首次渲染消费
const CUSTOM_BLOCK_PENDING_THEME_KEY = "__customBlockPendingTheme__";

/** 编译产物：模板组件 + 运行时样式。按模板源码缓存，跨挂载复用 */
interface CompiledBlock {
  Component: import("react").ComponentType<Record<string, never>>;
  runtimeCss: string;
}

/**
 * 编译缓存：同一模板的 Babel 编译（JSX/TS 转换，百 ms 级）与 Tailwind 运行时样式编译
 * 只做一次。custom-block 所在的元素随视口剔除反复卸载/重挂（白板平移、滚动）时，
 * 重挂载命中缓存直接渲染；内容不变就不再进编译器。
 */
const compiledCache = new Map<string, CompiledBlock>();
const COMPILED_CACHE_LIMIT = 50;

type TemplateReact = typeof import("react");

// 首次编译时创建并复用：ThemeContext 单例保证缓存组件跨主题/跨挂载可用（主题经 Provider value 下发）
let themeContextSingleton: import("react").Context<TemplateTheme> | null = null;
let useTokensSingleton: (() => TemplateTheme) | null = null;
const ensureTemplateHooks = (React: TemplateReact) => {
  if (!themeContextSingleton) {
    themeContextSingleton = React.createContext<TemplateTheme>({
      isDark: false,
      color: () => "",
    });
    useTokensSingleton = () => React.useContext(themeContextSingleton!);
  }
  return { ThemeContext: themeContextSingleton, useTokens: useTokensSingleton! };
};

interface CustomBlockRuntime {
  root?: Root;
  renderWithTheme?: (theme: CustomBlockTheme) => void;
  styleCleanup?: () => void;
  content?: string;
  pendingTheme?: CustomBlockTheme;
  themeRenderQueued?: boolean;
}

type CustomBlockRuntimeContainer = HTMLElement & {
  [CUSTOM_BLOCK_ROOT_KEY]?: CustomBlockRuntime["root"];
  [CUSTOM_BLOCK_RUNTIME_KEY]?: CustomBlockRuntime;
  [CUSTOM_BLOCK_PENDING_THEME_KEY]?: CustomBlockTheme;
};

const renderErrorMarkup = (error: unknown) =>
  `<div class="text-tau-body text-danger p-4">渲染错误: ${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

const toTemplateTheme = ({ isDark, token }: CustomBlockTheme): TemplateTheme => ({
  isDark,
  color: word => token(word),
});

type TauUi = typeof import("@tau/ui");

/** 模板可用的 @tau/ui 子集：文档内演示用的控件与非模态浮层；Dialog / Drawer 等模态浮层不进契约 */
const pickTemplateUi = (ui: TauUi) =>
  Object.freeze({
    Button: ui.Button,
    IconButton: ui.IconButton,
    Input: ui.Input,
    Textarea: ui.Textarea,
    NumberInput: ui.NumberInput,
    Switch: ui.Switch,
    Checkbox: ui.Checkbox,
    RadioGroup: ui.RadioGroup,
    Radio: ui.Radio,
    Select: ui.Select,
    Tag: ui.Tag,
    Spinner: ui.Spinner,
    Tooltip: ui.Tooltip,
    Popover: ui.Popover,
  });

const getRuntimeContainer = (targetElement: HTMLElement) =>
  targetElement as CustomBlockRuntimeContainer;

const cleanupRuntime = (
  container: CustomBlockRuntimeContainer,
  runtime: CustomBlockRuntime | undefined
) => {
  if (runtime) {
    runtime.themeRenderQueued = false;
  }
  runtime?.styleCleanup?.();
  runtime?.root?.unmount?.();
  if (container[CUSTOM_BLOCK_ROOT_KEY] === runtime?.root) {
    delete container[CUSTOM_BLOCK_ROOT_KEY];
  }
  if (container[CUSTOM_BLOCK_RUNTIME_KEY] === runtime) {
    delete container[CUSTOM_BLOCK_RUNTIME_KEY];
  }
  delete container[CUSTOM_BLOCK_PENDING_THEME_KEY];
};

const scheduleRuntimeThemeRender = (
  runtime: CustomBlockRuntime | undefined,
  theme: CustomBlockTheme
) => {
  if (!runtime?.renderWithTheme) return;

  runtime.pendingTheme = theme;
  if (runtime.themeRenderQueued) return;

  runtime.themeRenderQueued = true;
  const flushThemeRender = () => {
    runtime.themeRenderQueued = false;
    runtime.renderWithTheme?.(runtime.pendingTheme ?? theme);
  };

  if (typeof queueMicrotask === "function") {
    queueMicrotask(flushThemeRender);
    return;
  }

  Promise.resolve().then(flushThemeRender);
};

export const rerenderCustomBlockTheme = (targetElement: HTMLElement, theme: CustomBlockTheme) => {
  const container = getRuntimeContainer(targetElement);
  const runtime = container[CUSTOM_BLOCK_RUNTIME_KEY] as CustomBlockRuntime | undefined;
  if (!runtime?.renderWithTheme) {
    container[CUSTOM_BLOCK_PENDING_THEME_KEY] = theme;
    return;
  }
  scheduleRuntimeThemeRender(runtime, theme);
};

export const compileAndExecuteCustomBlock = async (
  content: string,
  theme: CustomBlockTheme,
  targetElement: HTMLElement,
  compilerService?: RuntimeStyleCompiler,
  abortSignal?: AbortSignal
): Promise<(() => void) | undefined> => {
  const container = getRuntimeContainer(targetElement);
  const existingRuntime = container[CUSTOM_BLOCK_RUNTIME_KEY] as CustomBlockRuntime | undefined;

  if (
    existingRuntime?.content === content &&
    existingRuntime.renderWithTheme &&
    existingRuntime.root
  ) {
    existingRuntime.renderWithTheme(theme);
    return () => {
      cleanupRuntime(container, existingRuntime);
    };
  }

  let cleanupStyle: (() => void) | undefined;
  const disposeRuntimeStyle = () => {
    if (!cleanupStyle) return;
    cleanupStyle();
    cleanupStyle = undefined;
  };

  const shouldAbort = () => {
    if (!abortSignal?.aborted) return false;
    disposeRuntimeStyle();
    return true;
  };

  try {
    let runtimeCss: string;
    let Component: CompiledBlock["Component"] | undefined;

    const cached = compiledCache.get(content);
    if (cached) {
      runtimeCss = cached.runtimeCss;
      Component = cached.Component;
    } else {
      runtimeCss = compilerService
        ? await compilerService.compile({ source: content, language: "tsx" })
        : "";

      if (shouldAbort()) {
        return undefined;
      }

      // 动态导入编译期依赖（渲染用的 react/react-dom 在缓存命中路径外按需导入）
      const [React, Babel, TauUi, icons] = await Promise.all([
        Promise.resolve(SharedReact),
        import("@babel/standalone"),
        Promise.resolve(SharedUi),
        import("lucide-react"),
      ]);

      if (shouldAbort()) {
        return undefined;
      }

      const { useTokens } = ensureTemplateHooks(React);

      const compiledCode =
        Babel.transform(content, {
          presets: [
            Babel.availablePresets["react"],
            [
              Babel.availablePresets["typescript"],
              {
                onlyRemoveTypeImports: true,
                allExtensions: true,
                isTSX: true,
              },
            ],
          ],
        }).code || "";

      if (shouldAbort()) {
        return undefined;
      }

      const AsyncFunction = Object.getPrototypeOf(
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        async function () {}
      ).constructor;

      const fn = new AsyncFunction(
        "React",
        "ui",
        "toast",
        "useTokens",
        "icons",
        compiledCode + "\nreturn typeof Component === 'function' ? Component : undefined;"
      );

      if (shouldAbort()) {
        return undefined;
      }

      Component = await fn(React, pickTemplateUi(TauUi), TauUi.toast, useTokens, icons);

      if (typeof Component === "function") {
        if (compiledCache.size >= COMPILED_CACHE_LIMIT) {
          compiledCache.delete(compiledCache.keys().next().value as string);
        }
        compiledCache.set(content, { Component, runtimeCss });
      }
    }

    if (runtimeCss && typeof document !== "undefined") {
      const styleElement = document.createElement("style");
      styleElement.dataset.customBlockTailwind = "runtime";
      styleElement.textContent = runtimeCss;
      document.head.appendChild(styleElement);
      cleanupStyle = () => {
        styleElement.remove();
      };
    }

    // 编译期间主题可能已变化，优先消费等待生效的最新主题
    const effectiveTheme = container[CUSTOM_BLOCK_PENDING_THEME_KEY] ?? theme;
    delete container[CUSTOM_BLOCK_PENDING_THEME_KEY];

    const React = SharedReact;
    const ReactDOM = SharedReactDOM;
    const ThemeContext = ensureTemplateHooks(React).ThemeContext;

    if (typeof Component !== "function") {
      return undefined;
    }

    const ensureRoot = () => {
      let root = container[CUSTOM_BLOCK_ROOT_KEY];
      if (!root) {
        root = ReactDOM.createRoot(targetElement);
        container[CUSTOM_BLOCK_ROOT_KEY] = root;
      }
      return root as CustomBlockRuntime["root"];
    };

    // 模板组件渲染在独立的 React root 里，编辑器的元素错误边界接不到，这里自带一层：
    // 渲染期抛错只在本块显示错误，不会卸掉整个 root 或波及页面
    class TemplateErrorBoundary extends React.Component<
      { children?: React.ReactNode },
      { error: unknown }
    > {
      state: { error: unknown } = { error: null };
      static getDerivedStateFromError(error: unknown) {
        return { error };
      }
      componentDidCatch(error: unknown) {
        console.error("CustomBlock render error:", error);
      }
      render() {
        if (this.state.error) {
          return React.createElement("div", {
            dangerouslySetInnerHTML: { __html: renderErrorMarkup(this.state.error) },
          });
        }
        return this.props.children;
      }
    }

    const renderWithTheme = (nextTheme: CustomBlockTheme) => {
      const root = ensureRoot();
      root?.render?.(
        React.createElement(
          ThemeContext.Provider,
          { value: toTemplateTheme(nextTheme) },
          React.createElement(
            "div",
            { style: { height: "100%", color: "var(--ed-text)" } },
            React.createElement(TemplateErrorBoundary, null, React.createElement(Component))
          )
        )
      );
      return root;
    };

    const root = renderWithTheme(effectiveTheme);

    const runtime: CustomBlockRuntime = {
      root,
      renderWithTheme,
      styleCleanup: cleanupStyle,
      content,
    };

    container[CUSTOM_BLOCK_RUNTIME_KEY] = runtime;

    if (abortSignal?.aborted) {
      cleanupRuntime(container, runtime);
      return undefined;
    }

    return () => {
      cleanupRuntime(container, runtime);
    };
  } catch (error) {
    disposeRuntimeStyle();
    console.error("CustomBlock compilation error:", error);
    if (targetElement) {
      targetElement.innerHTML = renderErrorMarkup(error);
    }
    return undefined;
  }
};
