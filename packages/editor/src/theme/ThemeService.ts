/**
 * 主题服务：编辑器读取「当前明暗」与「token 实际取值」的唯一入口。
 *
 * CSS 能表达的地方一律写 --ed-*（见 editor.css），不必经过本服务；本服务服务于 CSS 表达不了
 * 的场景：mermaid / shiki / codemirror / canvas 这类要把颜色当值传进去的渲染器。
 */

export type EditorThemeMode = "light" | "dark";

export interface ThemeService {
  /** 生效明暗 */
  readonly mode: EditorThemeMode;
  /** 宿主当前主题族的 key（桌面 paper/ocean…，移动端 apricot/midnight…）；宿主未标注时为空串 */
  readonly themeKey: string;
  /** 读取 CSS 变量的计算值，传入不带 `--` 的词（`ink-1` 取 --tau-ink-1，`code-bg` 取 --ed-code-bg） */
  token(word: string): string;
  /** 主题变化时通知；返回取消订阅 */
  subscribe(listener: () => void): () => void;
}

const readMode = (root: HTMLElement): EditorThemeMode => {
  // 优先 data-mode（@tau/themes 约定），其次 .dark 类，最后兼容把明暗写进 data-theme 的旧宿主
  const mode = root.dataset.mode;
  if (mode === "dark" || mode === "light") return mode;
  if (root.classList.contains("dark") || root.dataset.theme === "dark") return "dark";
  return "light";
};

const readToken = (root: HTMLElement, word: string): string => {
  const style = getComputedStyle(root);
  const scoped = style.getPropertyValue(`--ed-${word}`).trim();
  return scoped || style.getPropertyValue(`--tau-${word}`).trim();
};

/**
 * 默认实现：明暗与主题族从 DOM 读（`data-mode` / `data-theme`），token 取计算样式。
 * 传入 scope 可让 token 从编辑器子树读起（局部强制明暗的场景）。
 */
export function createDomThemeService(
  root: HTMLElement = document.documentElement,
  scope: () => HTMLElement | null = () => null
): ThemeService {
  const listeners = new Set<() => void>();
  let observer: MutationObserver | undefined;

  const notify = () => listeners.forEach(listener => listener());

  return {
    get mode() {
      return readMode(root);
    },
    get themeKey() {
      return root.dataset.theme ?? "";
    },
    token(word) {
      return readToken(scope() ?? root, word);
    },
    subscribe(listener) {
      listeners.add(listener);
      if (!observer) {
        observer = new MutationObserver(notify);
        observer.observe(root, {
          attributes: true,
          attributeFilter: ["class", "data-mode", "data-theme"],
        });
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          observer?.disconnect();
          observer = undefined;
        }
      };
    },
  };
}

/** 固定明暗的实现：预览、导出、测试等不跟随宿主的场景 */
export function createStaticThemeService(
  mode: EditorThemeMode,
  tokens: Record<string, string> = {}
): ThemeService {
  return {
    mode,
    themeKey: "",
    token: word => tokens[word] ?? "",
    subscribe: () => () => {},
  };
}
