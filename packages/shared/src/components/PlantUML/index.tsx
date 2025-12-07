import { useEffect, useState } from "react";
import plantumlEncoder from "plantuml-encoder";
import { useCreation, useDebounceFn } from "ahooks";
import { v4 as uuid } from "uuid";

interface IPlantUMLProps {
  isDark: boolean;
  content: string;
  nodeFetch?: (url: string, options: RequestInit) => Promise<any>;
}

const PlantUML = (props: IPlantUMLProps) => {
  const { content, isDark, nodeFetch } = props;
  const [svgContent, setSvgContent] = useState("");
  const [error, setError] = useState("");

  const plantUMLId = useCreation(() => {
    return `plantuml-${uuid()}`;
  }, []);

  const { run: render } = useDebounceFn(
    async () => {
      try {
        if (!content.trim()) {
          setSvgContent("");
          setError("");
          return;
        }
        const encoded = plantumlEncoder.encode(content);
        // 默认为 plantuml.com，后续可改为本地配置
        const server = "https://www.plantuml.com/plantuml";
        // const server = "http://localhost:8080/plantuml";
        const url = `${server}/svg/${encoded}`;

        // 使用 node-fetch 获取 SVG 内容
        const svg = await nodeFetch?.(url, {
          method: "GET",
          headers: {
            Accept: "image/svg+xml",
          },
        }) ?? "";

        // 解析 SVG 并移除背景色设置
        const processedSvg = processSvg(svg);
        setSvgContent(processedSvg);
        setError("");
      } catch (e: any) {
        console.error(e);
        setError(e.message || "渲染失败");
      }
    },
    { wait: 500 },
  );

  // 处理 SVG：移除背景色设置和字体设置
  const processSvg = (svgString: string): string => {
    try {
      // 使用 DOMParser 解析 SVG
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgString, "image/svg+xml");
      const svgElement = doc.querySelector("svg");

      if (!svgElement) {
        return svgString;
      }

      // 移除 style 属性中的 background 设置
      const styleAttr = svgElement.getAttribute("style");
      if (styleAttr) {
        // 解析 style 属性，移除 background 相关的样式
        const styles = styleAttr
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s && !s.toLowerCase().startsWith("background"));

        if (styles.length > 0) {
          svgElement.setAttribute("style", styles.join(";"));
        } else {
          svgElement.removeAttribute("style");
        }
      }

      // 移除单独的 background 属性（如果存在）
      svgElement.removeAttribute("background");

      // 移除所有 text 元素的 font-family 属性
      const textElements = svgElement.querySelectorAll("text");
      textElements.forEach((textElement) => {
        textElement.removeAttribute("font-family");
      });

      // 序列化回字符串
      const serializer = new XMLSerializer();
      return serializer.serializeToString(svgElement);
    } catch (e) {
      console.error("处理 SVG 失败:", e);
      return svgString;
    }
  };

  useEffect(() => {
    render();
  }, [content]);

  return (
    <div
      id={plantUMLId}
      className="w-full flex items-center justify-center"
      style={{
        fontFamily: "var(--mono-font)",
      }}
    >
      {error ? (
        <div className="text-[#D32F2F] dark:text-[#EF4444]">{error}</div>
      ) : svgContent ? (
        <div
          dangerouslySetInnerHTML={{ __html: svgContent }}
          className="max-w-full"
          style={{
            filter: isDark ? "invert(1) hue-rotate(180deg)" : "none",
          }}
        />
      ) : (
        <div className="text-[#6B7280] dark:text-[#9CA3AF]">Loading...</div>
      )}
    </div>
  );
};

export default PlantUML;
