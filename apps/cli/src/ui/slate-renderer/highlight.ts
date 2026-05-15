import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
} from "shiki";

let highlighter: Highlighter | null = null;
let initPromise: Promise<void> | null = null;

const COMMON_LANGS: BundledLanguage[] = [
  "javascript",
  "typescript",
  "python",
  "rust",
  "go",
  "json",
  "html",
  "css",
  "bash",
  "sql",
  "java",
  "c",
  "cpp",
  "markdown",
  "yaml",
  "toml",
  "jsx",
  "tsx",
];

export async function initHighlighter(): Promise<void> {
  if (highlighter) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      highlighter = await createHighlighter({
        themes: ["github-dark"],
        langs: COMMON_LANGS,
      });
    } catch {
      highlighter = null;
    }
  })();

  return initPromise;
}

export interface HighlightToken {
  text: string;
  color?: string;
}

const LANG_ALIASES: Record<string, string> = {
  shell: "bash",
  sh: "bash",
  zsh: "bash",
  yml: "yaml",
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  kt: "kotlin",
  rs: "rust",
  dockerfile: "docker",
  objc: "objective-c",
};

function normalizeLang(lang: string): string {
  const lower = lang.trim().toLowerCase();
  return LANG_ALIASES[lower] || lower;
}

export function highlightCode(
  code: string,
  language: string,
): HighlightToken[][] {
  if (!highlighter) {
    return code.split("\n").map((line) => [{ text: line }]);
  }

  const lang = normalizeLang(language);
  const loadedLangs = highlighter.getLoadedLanguages();
  if (!loadedLangs.includes(lang as BundledLanguage)) {
    return code.split("\n").map((line) => [{ text: line }]);
  }

  try {
    const tokens = highlighter.codeToTokensBase(code, {
      lang: lang as BundledLanguage,
      theme: "github-dark",
    });
    return tokens.map((line: any[]) =>
      line.map((token: any) => ({
        text: token.content,
        color: token.color,
      })),
    );
  } catch {
    return code.split("\n").map((line) => [{ text: line }]);
  }
}
