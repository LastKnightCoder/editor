import { useRef, useEffect, useState } from "react";
import { useCreation } from "ahooks";
import { renderMermaidSvg } from "../../../renderers/mermaid-render-core";
import { useEditorTheme } from "@tau/editor/api";
import { useReportPreviewError } from "@tau/editor-source-view";

interface IMermaidProps {
  chart: string;
}

const Mermaid = (props: IMermaidProps) => {
  const { chart } = props;
  // token 随主题族 / 明暗 / 局部强制明暗变化而换引用，借此触发重渲染
  const { isDark, token } = useEditorTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>("");
  const [svgContent, setSvgContent] = useState<string>("");
  // 在源码预览块内时错误交给块的错误条，这里保留上一次成功的图
  const errorReported = useReportPreviewError(error || null, { stale: !!svgContent });

  const mermaidId = useCreation(() => {
    return `mermaid-${Math.random().toString(36).slice(2)}`;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const renderMermaid = async () => {
      try {
        const svg = await renderMermaidSvg({
          code: chart,
          mermaidId,
          isDark,
          token,
        });

        if (!isMounted) return;

        setSvgContent(svg);
        setError("");
      } catch (e: unknown) {
        if (!isMounted) return;
        const errorMsg = typeof e === "string" ? e : e instanceof Error ? e.message : "渲染失败";
        setError(errorMsg);
      }
    };

    renderMermaid();

    return () => {
      isMounted = false;
    };
  }, [chart, mermaidId, isDark, token]);

  return (
    <>
      <code id={mermaidId} style={{ display: "none" }}></code>
      {error && !errorReported ? (
        <div className="p-[1em] text-center text-[0.875em] text-[var(--ed-danger)]">{error}</div>
      ) : (
        <div
          ref={ref}
          dangerouslySetInnerHTML={{ __html: svgContent }}
          // 超宽时容器内横向滚动；svg 用 margin auto 居中（而非 justify-center），超宽时左侧仍可滚动到
          className="flex w-full items-center overflow-x-auto p-[20px] [&>svg]:m-auto [&>svg]:shrink-0"
        />
      )}
    </>
  );
};

export default Mermaid;
