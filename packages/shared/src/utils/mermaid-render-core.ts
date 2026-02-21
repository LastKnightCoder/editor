import {
  DEFAULTS as BEAUTIFUL_DEFAULTS,
  THEMES as BEAUTIFUL_THEMES,
  renderMermaid as renderBeautifulMermaid,
  renderMermaidAscii,
} from "beautiful-mermaid";

export const MERMAID_THEME_NAMES = [
  "zinc-light",
  "zinc-dark",
  "tokyo-night",
  "tokyo-night-storm",
  "tokyo-night-light",
  "catppuccin-mocha",
  "catppuccin-latte",
  "nord",
  "nord-light",
  "dracula",
  "github-light",
  "github-dark",
  "solarized-light",
  "solarized-dark",
  "one-dark",
] as const;

export type MermaidThemeName = (typeof MERMAID_THEME_NAMES)[number];
export type MermaidRenderStyle = "svg" | "ascii-unicode";
export type MermaidDisplayMode = "svg" | "ascii";
export type MermaidRenderEngine = "beautiful-mermaid" | "mermaid";
export type MermaidDiagramType =
  | "flowchart"
  | "state"
  | "sequence"
  | "class"
  | "er"
  | "unknown";

export interface MermaidRenderPreference {
  style?: MermaidRenderStyle;
  lightTheme?: MermaidThemeName;
  darkTheme?: MermaidThemeName;
}

export interface MermaidRenderResult {
  displayMode: MermaidDisplayMode;
  displayContent: string;
  cachedSvg: string;
  engine: MermaidRenderEngine;
  isFallback: boolean;
  diagramType: MermaidDiagramType;
  fallbackReason?: string;
}

const SUPPORTED_DIAGRAM_TYPES: MermaidDiagramType[] = [
  "flowchart",
  "state",
  "sequence",
  "class",
  "er",
];

const DEFAULT_LIGHT_THEME: MermaidThemeName = "github-light";
const DEFAULT_DARK_THEME: MermaidThemeName = "github-dark";
const DEFAULT_STYLE: MermaidRenderStyle = "svg";

const sanitizeSvg = (svg: string): string => {
  return svg
    .replace(/@import\s+url\([^)]*\)\s*;?/g, "")
    .replace(/background:\s*var\(--bg\)\s*;?/g, "background: transparent;")
    .replace(/<style>\s*<\/style>/g, "<style></style>");
};

const isMermaidThemeName = (value?: string): value is MermaidThemeName => {
  if (!value) return false;
  return MERMAID_THEME_NAMES.includes(value as MermaidThemeName);
};

const resolveRenderStyle = (style?: MermaidRenderStyle): MermaidRenderStyle => {
  if (style === "ascii-unicode") {
    return "ascii-unicode";
  }
  return DEFAULT_STYLE;
};

const resolveThemeName = (
  preference: MermaidRenderPreference | undefined,
  isDark: boolean,
): MermaidThemeName => {
  const theme = isDark ? preference?.darkTheme : preference?.lightTheme;
  if (isMermaidThemeName(theme)) {
    return theme;
  }
  return isDark ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
};

const resolveBeautifulThemeColors = (themeName: MermaidThemeName) => {
  if (themeName === "zinc-light") {
    return BEAUTIFUL_DEFAULTS;
  }
  return BEAUTIFUL_THEMES[themeName];
};

export const detectMermaidDiagramType = (code: string): MermaidDiagramType => {
  const firstLine = code
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("%%"))
    ?.toLowerCase();

  if (!firstLine) {
    return "unknown";
  }
  if (/^(graph|flowchart)\b/.test(firstLine)) {
    return "flowchart";
  }
  if (/^statediagram(?:-v2)?\b/.test(firstLine)) {
    return "state";
  }
  if (/^sequencediagram\b/.test(firstLine)) {
    return "sequence";
  }
  if (/^classdiagram\b/.test(firstLine)) {
    return "class";
  }
  if (/^erdiagram\b/.test(firstLine)) {
    return "er";
  }
  return "unknown";
};

const renderWithOriginalMermaid = async (
  code: string,
  mermaidId: string,
  isDark: boolean,
) => {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? "dark" : "default",
    securityLevel: "loose",
    fontFamily: "monospace",
  });
  await mermaid.parse(code);
  const { svg } = await mermaid.render(mermaidId, code);
  return svg;
};

const isBeautifulMermaidSupported = (type: MermaidDiagramType) => {
  return SUPPORTED_DIAGRAM_TYPES.includes(type);
};

const buildFallbackResult = async (params: {
  code: string;
  mermaidId: string;
  isDark: boolean;
  diagramType: MermaidDiagramType;
  fallbackReason: string;
}): Promise<MermaidRenderResult> => {
  const svg = await renderWithOriginalMermaid(
    params.code,
    params.mermaidId,
    params.isDark,
  );
  return {
    displayMode: "svg",
    displayContent: svg,
    cachedSvg: svg,
    engine: "mermaid",
    isFallback: true,
    diagramType: params.diagramType,
    fallbackReason: params.fallbackReason,
  };
};

export const renderMermaidWithFallback = async (params: {
  code: string;
  mermaidId: string;
  isDark: boolean;
  preference?: MermaidRenderPreference;
}): Promise<MermaidRenderResult> => {
  const { code, mermaidId, isDark, preference } = params;
  const diagramType = detectMermaidDiagramType(code);
  const style = resolveRenderStyle(preference?.style);
  const themeName = resolveThemeName(preference, isDark);
  const themeColors = resolveBeautifulThemeColors(themeName);

  if (!isBeautifulMermaidSupported(diagramType)) {
    return buildFallbackResult({
      code,
      mermaidId,
      isDark,
      diagramType,
      fallbackReason: "该图表类型暂不受 beautiful-mermaid 支持，已自动回退。",
    });
  }

  if (style === "ascii-unicode") {
    try {
      const ascii = renderMermaidAscii(code, { useAscii: false });
      const svg = await renderBeautifulMermaid(code, themeColors);
      const sanitizedSvg = sanitizeSvg(svg);
      return {
        displayMode: "ascii",
        displayContent: ascii,
        cachedSvg: sanitizedSvg,
        engine: "beautiful-mermaid",
        isFallback: false,
        diagramType,
      };
    } catch (error) {
      console.error("beautiful-mermaid ascii render failed:", error);
      return buildFallbackResult({
        code,
        mermaidId,
        isDark,
        diagramType,
        fallbackReason: "ASCII 渲染失败，已自动回退到 Mermaid SVG。",
      });
    }
  }

  try {
    const svg = await renderBeautifulMermaid(code, themeColors);
    const sanitizedSvg = sanitizeSvg(svg);
    return {
      displayMode: "svg",
      displayContent: sanitizedSvg,
      cachedSvg: sanitizedSvg,
      engine: "beautiful-mermaid",
      isFallback: false,
      diagramType,
    };
  } catch (error) {
    console.error("beautiful-mermaid svg render failed:", error);
    return buildFallbackResult({
      code,
      mermaidId,
      isDark,
      diagramType,
      fallbackReason: "SVG 渲染失败，已自动回退到 Mermaid 原生渲染。",
    });
  }
};
