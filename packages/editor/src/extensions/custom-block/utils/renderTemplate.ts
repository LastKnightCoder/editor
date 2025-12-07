import * as ahooks from "ahooks";

const CUSTOM_BLOCK_ROOT_KEY = "__customBlockRoot__";

export const getCustomBlockRenderTemplate = (isDark: boolean) => {
  const prefix = `const { antd } = components;\n`;

  const suffix = `
    if (typeof Component === 'function') {
      const RenderApp = () => {
        const { ConfigProvider, theme, App } = antd;
        return (
          <App
            style={{
              height: "100%",
              fontSize: "var(--font-size)",
              color: "var(--text-normal)",
            }}
          >
            <ConfigProvider
              theme={{
                algorithm: ${isDark} ? theme.darkAlgorithm : theme.defaultAlgorithm,
              }}
            >
              <Component />
            </ConfigProvider>
          </App>
        )
      }
      const ROOT_KEY = "${CUSTOM_BLOCK_ROOT_KEY}";
      const container = el as any;
      let root = container?.[ROOT_KEY];
      if (!root) {
        root = ReactDOM.createRoot(el);
        if (container) {
          container[ROOT_KEY] = root;
        }
      }
      root.render(<RenderApp />);
    }`;

  return { prefix, suffix };
};

// 生成完整的可执行代码（注意：不包含 return，由调用方在 AsyncFunction 中添加）
export const generateExecutableCode = (
  content: string,
  isDark: boolean,
): string => {
  const { prefix, suffix } = getCustomBlockRenderTemplate(isDark);
  return `${prefix}${content}${suffix}`;
};

export const compileAndExecuteCustomBlock = async (
  content: string,
  isDark: boolean,
  targetElement: HTMLElement,
  hooks?: Record<string, any>,
  compilerService?: { tailwindRuntime?: (html: string) => Promise<string> },
  abortSignal?: AbortSignal,
): Promise<(() => void) | undefined> => {
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
    const containerWithRoot = targetElement as unknown as Record<string, any>;
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

    // 生成并编译代码
    const normalizedCode = generateExecutableCode(content, isDark);
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

    // 创建并执行 AsyncFunction
    const AsyncFunction = Object.getPrototypeOf(
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      async function () {},
    ).constructor;

    const fn = new AsyncFunction(
      "React",
      "ReactDOM",
      "el",
      "components",
      "hooks",
      "extraInfo",
      compiledCode + "\nreturn root;",
    );

    if (shouldAbort()) {
      return undefined;
    }

    const root = await fn(
      React,
      ReactDOM,
      targetElement,
      { antd, antdIcons },
      {
        ...ahooks,
        ...hooks,
      },
      { isDark },
    );

    const clearContainerRoot = () => {
      if (containerWithRoot && containerWithRoot[CUSTOM_BLOCK_ROOT_KEY] === root) {
        delete containerWithRoot[CUSTOM_BLOCK_ROOT_KEY];
      }
    };

    if (abortSignal?.aborted) {
      root?.unmount?.();
      disposeRuntimeStyle();
      clearContainerRoot();
      return undefined;
    }

    // 返回清理函数
    return () => {
      disposeRuntimeStyle();
      root?.unmount?.();
      clearContainerRoot();
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
