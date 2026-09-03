import * as ahooks from "ahooks";
import type { Root } from "react-dom/client";

const CUSTOM_BLOCK_ROOT_KEY = "__customBlockRoot__";
const CUSTOM_BLOCK_RUNTIME_KEY = "__customBlockRuntime__";

interface CustomBlockRuntime {
  root?: Root;
  renderWithTheme?: (isDark: boolean) => void;
  styleCleanup?: () => void;
  content?: string;
  pendingTheme?: boolean;
  themeRenderQueued?: boolean;
}

type CustomBlockHookMap = Record<string, unknown>;

type CustomBlockRuntimeContainer = HTMLElement & {
  [CUSTOM_BLOCK_ROOT_KEY]?: CustomBlockRuntime["root"];
  [CUSTOM_BLOCK_RUNTIME_KEY]?: CustomBlockRuntime;
};

export const getCustomBlockRenderTemplate = () => {
  const prefix = `const { antd } = components;\n`;

  const suffix = ``;

  return { prefix, suffix };
};

// 生成完整的可执行代码（注意：不包含 return，由调用方在 AsyncFunction 中添加）
export const generateExecutableCode = (content: string): string => {
  const { prefix, suffix } = getCustomBlockRenderTemplate();
  return `${prefix}${content}${suffix}`;
};

const getRuntimeTheme = (isDark: boolean) => ({
  theme: isDark ? "dark" : "light",
  isDark,
});

const getRuntimeContainer = (targetElement: HTMLElement) =>
  targetElement as CustomBlockRuntimeContainer;

const cleanupRuntime = (
  container: CustomBlockRuntimeContainer,
  runtime: CustomBlockRuntime | undefined,
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
};

const scheduleRuntimeThemeRender = (
  runtime: CustomBlockRuntime | undefined,
  isDark: boolean,
) => {
  if (!runtime?.renderWithTheme) return;

  runtime.pendingTheme = isDark;
  if (runtime.themeRenderQueued) return;

  runtime.themeRenderQueued = true;
  const flushThemeRender = () => {
    runtime.themeRenderQueued = false;
    runtime.renderWithTheme?.(runtime.pendingTheme ?? isDark);
  };

  if (typeof queueMicrotask === "function") {
    queueMicrotask(flushThemeRender);
    return;
  }

  Promise.resolve().then(flushThemeRender);
};

export const rerenderCustomBlockTheme = (
  targetElement: HTMLElement,
  isDark: boolean,
) => {
  const container = getRuntimeContainer(targetElement);
  const runtime = container[CUSTOM_BLOCK_RUNTIME_KEY] as
    | CustomBlockRuntime
    | undefined;
  scheduleRuntimeThemeRender(runtime, isDark);
};

export const compileAndExecuteCustomBlock = async (
  content: string,
  isDark: boolean,
  targetElement: HTMLElement,
  hooks?: CustomBlockHookMap,
  compilerService?: { tailwindRuntime?: (html: string) => Promise<string> },
  abortSignal?: AbortSignal,
): Promise<(() => void) | undefined> => {
  const container = getRuntimeContainer(targetElement);
  const existingRuntime = container[CUSTOM_BLOCK_RUNTIME_KEY] as
    | CustomBlockRuntime
    | undefined;

  if (
    existingRuntime?.content === content &&
    existingRuntime.renderWithTheme &&
    existingRuntime.root
  ) {
    existingRuntime.renderWithTheme(isDark);
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
    const runtimeCss = compilerService
      ? await compilerService.tailwindRuntime?.(content)
      : "";
    if (runtimeCss && typeof document !== "undefined") {
      const styleElement = document.createElement("style");
      styleElement.dataset.customBlockTailwind = "runtime";
      styleElement.textContent = runtimeCss;
      document.head.appendChild(styleElement);
      cleanupStyle = () => {
        styleElement.remove();
      };
    }

    if (shouldAbort()) {
      return undefined;
    }

    // 动态导入依赖
    const [React, ReactDOM, Babel, antd, antdIcons] = await Promise.all([
      import("react"),
      import("react-dom/client"),
      import("@babel/standalone"),
      import("antd"),
      import("@ant-design/icons"),
    ]);

    if (shouldAbort()) {
      return undefined;
    }

    const ThemeContext = React.createContext(getRuntimeTheme(isDark));
    const useRuntimeTheme = () => React.useContext(ThemeContext);

    const normalizedCode = generateExecutableCode(content);
    const compiledCode =
      Babel.transform(normalizedCode, {
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
      async function () {},
    ).constructor;

    const fn = new AsyncFunction(
      "React",
      "components",
      "hooks",
      "extraInfo",
      compiledCode +
        "\nreturn typeof Component === 'function' ? Component : undefined;",
    );

    if (shouldAbort()) {
      return undefined;
    }

    const Component = await fn(
      React,
      { antd, antdIcons },
      {
        ...ahooks,
        ...hooks,
        useTheme: useRuntimeTheme,
      },
      getRuntimeTheme(isDark),
    );

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

    const renderWithTheme = (nextIsDark: boolean) => {
      const { ConfigProvider, theme, App } = antd;
      const root = ensureRoot();
      root?.render?.(
        React.createElement(
          ThemeContext.Provider,
          { value: getRuntimeTheme(nextIsDark) },
          React.createElement(
            App,
            {
              style: {
                height: "100%",
                fontSize: "var(--font-size)",
                color: "var(--th-text)",
              },
            },
            React.createElement(
              ConfigProvider,
              {
                theme: {
                  algorithm: nextIsDark
                    ? theme.darkAlgorithm
                    : theme.defaultAlgorithm,
                },
              },
              React.createElement(Component),
            ),
          ),
        ),
      );
      return root;
    };

    const root = renderWithTheme(isDark);

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
      targetElement.innerHTML = `<div class="text-red-500 p-4">渲染错误: ${error instanceof Error ? error.message : String(error)}</div>`;
    }
    return undefined;
  }
};
