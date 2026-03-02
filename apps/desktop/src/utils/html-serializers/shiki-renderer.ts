import { createHighlighter, type Highlighter } from "shiki";

const DEFAULT_SHIKI_THEME = "github-light";
const DEFAULT_LANGUAGE = "text";

const PRELOAD_LANGUAGES = [
  "text",
  "plaintext",
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "json",
  "bash",
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
  "cpp",
  "csharp",
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
  "c++": "cpp",
  "c#": "csharp",
  yml: "yaml",
  xml: "html",
  "html/xml": "html",
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
  const normalized = (language || DEFAULT_LANGUAGE).trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_LANGUAGE;
  }
  return LANGUAGE_ALIASES[normalized] || normalized;
};

const ensureHighlighter = async (): Promise<Highlighter> => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [DEFAULT_SHIKI_THEME],
      langs: PRELOAD_LANGUAGES,
    });
  }
  return await highlighterPromise;
};

const ensureLanguageLoaded = async (
  highlighter: Highlighter,
  language: string,
): Promise<boolean> => {
  if (highlighter.getLoadedLanguages().includes(language as any)) {
    return true;
  }
  try {
    await highlighter.loadLanguage(language as any);
    return true;
  } catch {
    return false;
  }
};

const ensureCodeBlockClasses = (html: string, language: string): string => {
  const classes = ["code-block", "shiki", `language-${language}`];
  const withClassAttr = html.replace(
    /<pre([^>]*)class="([^"]*)"([^>]*)>/,
    (_match, before, currentClasses, after) => {
      const classSet = new Set(
        String(currentClasses)
          .split(/\s+/)
          .map((item) => item.trim())
          .filter(Boolean),
      );
      classes.forEach((name) => classSet.add(name));
      return `<pre${before}class="${Array.from(classSet).join(" ")}"${after}>`;
    },
  );

  if (withClassAttr !== html) {
    return withClassAttr;
  }

  return html.replace(
    /<pre([^>]*)>/,
    `<pre$1 class="code-block shiki language-${language}">`,
  );
};

const normalizeShikiLineNodes = (html: string): string => {
  return html.replace(
    /(<code[^>]*>)([\s\S]*?)(<\/code>)/,
    (
      _match,
      codeOpenTag: string,
      codeInnerHtml: string,
      codeCloseTag: string,
    ) => {
      const normalizedInnerHtml = codeInnerHtml
        .replace(/<\/span>\r?\n(?=<span class="line")/g, "</span>")
        .replace(/>\r?\n(?=<span class="line")/g, ">");
      return `${codeOpenTag}${normalizedInnerHtml}${codeCloseTag}`;
    },
  );
};

const createFallbackHtml = (code: string, language: string): string => {
  const safeCode = escapeHtml(code);
  return `<pre class="code-block shiki language-${language}"><code>${safeCode}</code></pre>`;
};

export const getDefaultShikiTheme = (): string => DEFAULT_SHIKI_THEME;

export const renderCodeWithShiki = async (
  code: string,
  language?: string,
  theme: string = DEFAULT_SHIKI_THEME,
): Promise<string> => {
  const normalizedLanguage = normalizeLanguage(language);

  try {
    const highlighter = await ensureHighlighter();
    const isLoaded = await ensureLanguageLoaded(
      highlighter,
      normalizedLanguage,
    );
    if (!isLoaded) {
      return createFallbackHtml(code, normalizedLanguage);
    }
    const html = highlighter.codeToHtml(code, {
      lang: normalizedLanguage,
      theme,
    });
    const withCodeBlockClasses = ensureCodeBlockClasses(
      html,
      normalizedLanguage,
    );
    return normalizeShikiLineNodes(withCodeBlockClasses);
  } catch {
    return createFallbackHtml(code, normalizedLanguage);
  }
};
