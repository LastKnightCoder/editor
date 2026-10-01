/**
 * Mermaid 主题适配：把 --tau-* token 的实际取值映射成 mermaid `base` 主题的 themeVariables。
 *
 * mermaid 用 khroma 从基础色推算派生色，且不认识 var()、空格分隔的 hsl 与透明色叠加，
 * 因此所有取值先合成到卡片底色上、统一成不透明 hex 再交给它。
 */

/** 读取 token 取值，入参是不带 `--tau-` 前缀的词（`ink-1`、`bg-surface`） */
export type MermaidTokenReader = (word: string) => string;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
};

/** 解析 #hex / rgb(a) / hsl(a)，逗号与空格（含 `/ alpha`）写法都兼容；无法解析返回 null */
export const parseColor = (value: string): Rgba | null => {
  const v = value.trim().toLowerCase();
  const hex = v.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = [...digits].map(d => d + d).join("");
    }
    if (digits.length !== 6 && digits.length !== 8) return null;
    const n = (i: number) => parseInt(digits.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = v.match(/^(rgba?|hsla?)\(([^)]+)\)$/);
  if (!fn) return null;
  const parts = fn[2].split(/[,/\s]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const nums = parts.map(p => Number(p.replace(/%|deg$/, "")));
  if (nums.some(Number.isNaN)) return null;
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? nums[3] / 100 : nums[3];
  if (fn[1].startsWith("hsl")) {
    const [r, g, b] = hslToRgb(nums[0], nums[1] / 100, nums[2] / 100);
    return { r, g, b, a: alpha };
  }
  return { r: nums[0], g: nums[1], b: nums[2], a: alpha };
};

const toHex = ({ r, g, b }: Rgba): string =>
  "#" +
  [r, g, b]
    .map(c =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("");

/** 把可能带透明度的颜色合成到不透明底色上 */
const flatten = (fg: Rgba, bg: Rgba): Rgba => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
});

export interface MermaidThemeConfig {
  themeVariables: Record<string, string | boolean>;
  themeCSS: string;
  fontFamily?: string;
  /** SVG 根节点底色：导出时图表自带主题底色，深色图放进浅色页面也可读 */
  background: string;
}

const TAG_COUNT = 5;

/**
 * 由 token 生成 mermaid 主题配置；卡片底色或正文色读不到（未挂主题、非 DOM 环境）时返回 null，
 * 由调用方回落官方主题。
 */
export const buildMermaidTheme = (
  token: MermaidTokenReader,
  isDark: boolean
): MermaidThemeConfig | null => {
  const surface = parseColor(token("bg-surface"));
  if (!surface || !parseColor(token("ink-1"))) return null;
  const opaqueSurface = { ...surface, a: 1 };

  const color = (word: string): string => {
    const parsed = parseColor(token(word));
    return toHex(parsed ? flatten(parsed, opaqueSurface) : opaqueSurface);
  };
  const tag = (index: number, soft = false) =>
    color(`tag-${(index % TAG_COUNT) + 1}${soft ? "-soft" : ""}`);

  const background = color("bg-surface");
  const ink1 = color("ink-1");
  const ink2 = color("ink-2");
  const ink3 = color("ink-3");
  const inkInverse = color("ink-inverse");
  const line1 = color("line-1");
  const accent = color("accent");
  const accentSoft = color("accent-soft");
  const surfaceHover = color("bg-surface-hover");

  const themeVariables: Record<string, string | boolean> = {
    darkMode: isDark,
    background,
    fontSize: "14px",

    // 通用三档：主色（节点）/ 次色（标签、激活条）/ 第三色（分组、背景块）
    primaryColor: accentSoft,
    primaryBorderColor: accent,
    primaryTextColor: ink1,
    secondaryColor: tag(1, true),
    secondaryBorderColor: tag(1),
    secondaryTextColor: ink1,
    tertiaryColor: surfaceHover,
    tertiaryBorderColor: line1,
    tertiaryTextColor: ink1,
    textColor: ink1,
    titleColor: ink1,
    lineColor: ink3,
    arrowheadColor: ink3,
    defaultLinkColor: ink3,
    edgeLabelBackground: background,

    // 流程图 / 类图 / 状态图
    mainBkg: accentSoft,
    nodeBorder: accent,
    nodeTextColor: ink1,
    clusterBkg: surfaceHover,
    clusterBorder: line1,
    labelBackgroundColor: background,

    // 注释
    noteBkgColor: color("warn-soft"),
    noteBorderColor: color("warn"),
    noteTextColor: ink1,

    // 时序图
    actorBkg: accentSoft,
    actorBorder: accent,
    actorTextColor: ink1,
    actorLineColor: ink3,
    signalColor: ink2,
    signalTextColor: ink1,
    labelBoxBkgColor: surfaceHover,
    labelBoxBorderColor: line1,
    labelTextColor: ink1,
    loopTextColor: ink2,
    activationBkgColor: surfaceHover,
    activationBorderColor: line1,
    sequenceNumberColor: inkInverse,

    // 甘特图
    sectionBkgColor: tag(0, true),
    altSectionBkgColor: background,
    sectionBkgColor2: tag(1, true),
    excludeBkgColor: surfaceHover,
    gridColor: line1,
    taskBkgColor: accentSoft,
    taskBorderColor: accent,
    taskTextColor: ink1,
    taskTextLightColor: ink1,
    taskTextDarkColor: ink1,
    taskTextOutsideColor: ink1,
    activeTaskBkgColor: tag(1, true),
    activeTaskBorderColor: tag(1),
    doneTaskBkgColor: color("bg-sunken"),
    doneTaskBorderColor: line1,
    critBkgColor: color("danger-soft"),
    critBorderColor: color("danger"),
    todayLineColor: color("danger"),

    // 饼图
    pieTitleTextColor: ink1,
    pieSectionTextColor: inkInverse,
    pieLegendTextColor: ink1,
    pieStrokeColor: background,
    pieOuterStrokeColor: line1,
    pieOpacity: "1",

    errorBkgColor: color("danger-soft"),
    errorTextColor: color("danger"),
  };

  for (let i = 0; i < 12; i += 1) {
    // 饼图实色扇区 + 反色文字；思维导图 / 时间线 / 旅程图用浅色色块 + 正文色
    themeVariables[`pie${i + 1}`] = tag(i);
    themeVariables[`cScale${i}`] = tag(i, true);
    themeVariables[`cScalePeer${i}`] = tag(i);
    themeVariables[`cScaleLabel${i}`] = ink1;
  }
  for (let i = 0; i < 8; i += 1) {
    themeVariables[`git${i}`] = tag(i);
    themeVariables[`gitBranchLabel${i}`] = inkInverse;
  }

  const fontFamily = token("font").replace(/\s+/g, " ").trim() || undefined;

  // 选择器由 mermaid 自动加上图表 id 前缀，只作用于本图
  const themeCSS = [
    ".node rect, .node polygon, .node circle, .node ellipse, .node path { stroke-width: 1.25px; }",
    ".flowchart-link { stroke-width: 1.5px; }",
    ".cluster rect { stroke-width: 1px; }",
    ".cluster-label, .nodeLabel { font-weight: 500; }",
  ].join("\n");

  return { themeVariables, themeCSS, fontFamily, background };
};

/** 默认取值：从 <html> 读 --tau-*（编辑器内应传 ThemeService.token，以兼容局部强制明暗） */
export const readDocumentToken: MermaidTokenReader = word => {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(`--tau-${word}`).trim();
};

/** 给 mermaid 输出的根 <svg> 补底色 */
export const withSvgBackground = (svg: string, color: string): string =>
  svg.replace(/<svg\b[^>]*>/, tag =>
    /\sstyle="/.test(tag)
      ? tag.replace(/\sstyle="/, ` style="background-color: ${color}; `)
      : tag.replace(/^<svg\b/, `<svg style="background-color: ${color};"`)
  );
