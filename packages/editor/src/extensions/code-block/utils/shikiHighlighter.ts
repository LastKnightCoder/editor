import { createHighlighter, type Highlighter } from "shiki";
import { parseHighlightLinesToSet } from "./highlightLineRanges";

const LIGHT_THEME = "github-light";
const DARK_THEME = "github-dark";

const PRELOAD_LANGUAGES = [
  "text",
  "plaintext",
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "json",
  "bash",
  "shell",
  "python",
  "java",
  "go",
  "rust",
  "html",
  "css",
  "sql",
  "yaml",
  "markdown",
  "diff",
];

const LANGUAGE_ALIASES: Record<string, string> = {
  "plain text": "text",
  text: "text",
  txt: "text",
  js: "javascript",
  ts: "typescript",
  md: "markdown",
  py: "python",
  rs: "rust",
  sh: "bash",
  zsh: "bash",
  shell: "bash",
  xml: "html",
  "html/xml": "html",
  csharp: "csharp",
  c: "c",
  "c++": "cpp",
  cpp: "cpp",
  yml: "yaml",
  dockerfile: "docker",
  stex: "latex",
};

let highlighterPromise: Promise<Highlighter> | null = null;

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeLanguage = (language?: string): string => {
  const normalized = (language || "text").trim().toLowerCase();
  return LANGUAGE_ALIASES[normalized] || normalized || "text";
};

const ensureHighlighter = async (): Promise<Highlighter> => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [LIGHT_THEME, DARK_THEME],
      langs: PRELOAD_LANGUAGES,
    });
  }
  return highlighterPromise;
};

export const getShikiTheme = (isDark: boolean): string =>
  isDark ? DARK_THEME : LIGHT_THEME;

export const getShikiHighlighter = async (): Promise<Highlighter> => {
  return await ensureHighlighter();
};

export const renderCodeWithShiki = async (
  code: string,
  language: string,
  isDark: boolean,
  highlightLines?: string,
): Promise<string> => {
  const highlighter = await ensureHighlighter();
  const lang = normalizeLanguage(language);
  const theme = getShikiTheme(isDark);
  try {
    if (!highlighter.getLoadedLanguages().includes(lang as any)) {
      await highlighter.loadLanguage(lang as any);
    }
    const options: Parameters<typeof highlighter.codeToHtml>[1] = {
      lang,
      theme,
    };
    if (highlightLines?.trim()) {
      const total = code.split("\n").length;
      const highlighted = parseHighlightLinesToSet(highlightLines, total);
      if (highlighted.size > 0) {
        options.transformers = [
          {
            line(node: any, line: number) {
              const cls = highlighted.has(line) ? "highlighted" : "dishonored";
              this.addClassToHast(node, cls);
            },
          },
        ];
      }
    }
    return highlighter.codeToHtml(code, options);
  } catch {
    const safeCode = escapeHtml(code);
    return `<pre class="shiki" style="background-color:transparent"><code>${safeCode}</code></pre>`;
  }
};

export const resolveShikiLanguage = (language: string): string =>
  normalizeLanguage(language);
