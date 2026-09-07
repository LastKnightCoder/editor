import plantumlEncoder from "plantuml-encoder";

/**
 * PlantUML 渲染（slidev 方案）：编码后直接经渲染服务器以 <img> 呈现，
 * 不依赖任何宿主 fetch 能力。暗色沿用 PlantUML 官方主题机制——
 * 在图源注入 !theme（默认 cyborg-outline：透明底、为暗色背景设计），
 * 由服务器直接渲染暗色图，而非 CSS 反转。
 * 渲染结果不写回文档，始终根据当前源码生成地址。
 */
interface IPlantUMLProps {
  isDark: boolean;
  content: string;
  /** 渲染服务器地址，默认 plantuml.com（可指向自建实例） */
  server?: string;
  /** 暗色主题名，暗色时注入 `!theme`；置空串可禁用。默认 cyborg-outline */
  darkTheme?: string;
}

export const PLANTUML_DEFAULT_SERVER = "https://www.plantuml.com/plantuml";

/** 生成 PlantUML 渲染服务器的 SVG 地址（导出 HTML 等静态场景复用） */
export const buildPlantumlSvgUrl = (content: string, server: string = PLANTUML_DEFAULT_SERVER) => {
  const trimmed = content.trim();
  return trimmed ? `${server}/svg/${plantumlEncoder.encode(trimmed)}` : "";
};

const DEFAULT_DARK_THEME = "cyborg-outline";

/** 暗色时在第一个 @startXXX 之后注入主题指令；图源已声明主题时尊重作者不覆盖 */
export const applyDarkTheme = (content: string, theme: string): string => {
  if (!theme || /^\s*!theme/m.test(content)) {
    return content;
  }
  const directive = `!theme ${theme}`;
  const startMatch = content.match(/@start\w+[^\n]*\n?/);
  if (startMatch && startMatch.index !== undefined) {
    const insertAt = startMatch.index + startMatch[0].length;
    return `${content.slice(0, insertAt)}${directive}\n${content.slice(insertAt)}`;
  }
  return `${directive}\n${content}`;
};

const PlantUML = (props: IPlantUMLProps) => {
  const {
    content,
    isDark,
    server = PLANTUML_DEFAULT_SERVER,
    darkTheme = DEFAULT_DARK_THEME,
  } = props;

  const themedContent = isDark ? applyDarkTheme(content, darkTheme) : content;
  const imgUrl = buildPlantumlSvgUrl(themedContent, server);

  return (
    <div
      className="flex w-full items-center justify-center"
      style={{
        fontFamily: "var(--mono-font)",
      }}
    >
      {!content.trim() ? null : <img src={imgUrl} alt="PlantUML diagram" className="max-w-full" />}
    </div>
  );
};

export default PlantUML;
