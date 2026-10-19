import { PLANTUML_DEFAULT_SERVER, buildPlantumlSvgUrl, applyDarkTheme } from "../plantuml-source";
import { useState } from "react";

/**
 * PlantUML 渲染（slidev 方案）：编码后直接经渲染服务器以 <img> 呈现，
 * 不依赖任何宿主 fetch 能力。暗色沿用 PlantUML 官方主题机制——
 * 在图源注入 !theme（默认 cyborg-outline：透明底、为暗色背景设计），
 * 由服务器直接渲染暗色图，而非 CSS 反转。
 * 渲染结果不写回文档，始终根据当前源码生成地址。
 */
export interface IPlantUMLProps {
  isDark: boolean;
  content: string;
  /** 渲染服务器地址，默认 plantuml.com（可指向自建实例） */
  server?: string;
  /** 暗色主题名，暗色时注入 `!theme`；置空串可禁用。默认 cyborg-outline */
  darkTheme?: string;
  /** 图片加载失败（网络或服务器不可用）时回调错误信息，加载成功回调 null；失败时退回上一张成功的图 */
  onError?: (error: string | null, hasPrevious?: boolean) => void;
}

const DEFAULT_DARK_THEME = "cyborg-outline";

const PlantUML = (props: IPlantUMLProps) => {
  const {
    content,
    isDark,
    server = PLANTUML_DEFAULT_SERVER,
    darkTheme = DEFAULT_DARK_THEME,
    onError,
  } = props;

  const themedContent = isDark ? applyDarkTheme(content, darkTheme) : content;
  const imgUrl = buildPlantumlSvgUrl(themedContent, server);
  const [loadedUrl, setLoadedUrl] = useState("");
  const [failedUrl, setFailedUrl] = useState("");
  // 当前地址加载失败时显示上一张成功的图，而不是破图图标
  const shownUrl = failedUrl === imgUrl && loadedUrl ? loadedUrl : imgUrl;

  return (
    <div
      className="flex w-full items-center justify-center"
      style={{
        fontFamily: "var(--ed-font-mono, var(--tau-font-mono))",
      }}
    >
      {!content.trim() ? null : (
        <img
          src={shownUrl}
          alt="PlantUML diagram"
          className="max-w-full"
          onLoad={event => {
            const src = event.currentTarget.getAttribute("src") ?? "";
            setLoadedUrl(src);
            if (src === imgUrl) onError?.(null);
          }}
          onError={event => {
            if (event.currentTarget.getAttribute("src") !== imgUrl) return;
            setFailedUrl(imgUrl);
            onError?.("无法加载 PlantUML 渲染结果，请检查网络或渲染服务器地址", !!loadedUrl);
          }}
        />
      )}
    </div>
  );
};

export default PlantUML;
