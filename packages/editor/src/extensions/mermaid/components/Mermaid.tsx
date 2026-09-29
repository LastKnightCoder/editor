import { useRef, useEffect, useState } from "react";
import { useCreation, useMemoizedFn } from "ahooks";
import { renderMermaidSvg } from "@tau/shared";
import useTheme from "../../../hooks/useTheme";

interface IMermaidProps {
  chart: string;
  /** Cached SVG from previous render */
  initialSvg?: string;
  /** The chart code that was used to generate the cached SVG */
  compiledFrom?: string;
  /** Callback when SVG is compiled */
  onCompiled?: (svg: string, compiledFrom: string) => void;
}

const Mermaid = (props: IMermaidProps) => {
  const { chart, initialSvg, compiledFrom, onCompiled } = props;
  const { isDark } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>("");
  const [svgContent, setSvgContent] = useState<string>("");

  const stableOnCompiled = useMemoizedFn(onCompiled ?? (() => {}));

  const initialSvgRef = useRef(initialSvg);
  const compiledFromRef = useRef(compiledFrom);
  initialSvgRef.current = initialSvg;
  compiledFromRef.current = compiledFrom;

  const mermaidId = useCreation(() => {
    return `mermaid-${Math.random().toString(36).slice(2)}`;
  }, []);

  useEffect(() => {
    // Capture ref values at the time this effect runs, before any async work
    const cachedSvg = initialSvgRef.current;
    const cachedFrom = compiledFromRef.current;
    const hasCachedSvg = cachedFrom === chart && !!cachedSvg;

    // 先展示缓存 SVG，再继续后台渲染，确保主题切换时可实时刷新
    if (hasCachedSvg && cachedSvg) {
      setSvgContent(cachedSvg);
      setError("");
    }

    let isMounted = true;

    const renderMermaid = async () => {
      try {
        const svg = await renderMermaidSvg({
          code: chart,
          mermaidId,
          isDark,
        });

        if (!isMounted) return;

        setSvgContent(svg);
        setError("");

        if (cachedFrom !== chart || cachedSvg !== svg) {
          stableOnCompiled(svg, chart);
        }
      } catch (e: unknown) {
        if (!isMounted) return;
        const errorMsg = typeof e === "string" ? e : e instanceof Error ? e.message : "渲染失败";
        setError(errorMsg);
        setSvgContent("");
      }
    };

    renderMermaid();

    return () => {
      isMounted = false;
    };
  }, [chart, mermaidId, isDark, stableOnCompiled]);

  return (
    <>
      <code id={mermaidId} style={{ display: "none" }}></code>
      {error ? (
        <div
          style={{
            color: "#e13238",
            padding: "1em",
            fontSize: "14px",
            textAlign: "center",
          }}
        >
          {error}
        </div>
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
