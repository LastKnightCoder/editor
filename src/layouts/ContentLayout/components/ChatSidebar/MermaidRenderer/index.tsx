import React, { useEffect, useRef, useState } from "react";
import useTheme from "@/hooks/useTheme";
import { measurePerformance } from "../hooks/usePerformanceMonitor";
import styles from "./index.module.less";
import { useDebounce, useCreation } from "ahooks";
import LazySyntaxHighlighter from "../LazySyntaxHighlighter";

interface MermaidRendererProps {
  code: string;
}

const MermaidRenderer: React.FC<MermaidRendererProps> = ({ code }) => {
  const { isDark } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [error, setError] = useState<string>("");
  const debouncedCode = useDebounce(code, {
    wait: 500,
  });

  // 生成唯一的 mermaid ID
  const mermaidId = useCreation(() => {
    return `mermaid-${Math.random().toString(36).substring(2, 11)}`;
  }, []);

  useEffect(() => {
    const perf = measurePerformance("mermaid-render");
    let isMounted = true;

    const renderMermaid = async () => {
      try {
        if (!isMounted) return;
        setError("");

        const mermaid = (await import("mermaid")).default;

        // 配置 Mermaid
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "loose",
          fontFamily: "monospace",
        });

        await mermaid.parse(debouncedCode);

        // 执行渲染
        const { svg } = await mermaid.render(mermaidId, debouncedCode);

        if (isMounted) {
          setError("");
          setSvgContent(svg);
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to render diagram");
        }
      } finally {
        if (isMounted) {
          perf.end();
        }
      }
    };

    if (debouncedCode) {
      renderMermaid();
    }

    return () => {
      isMounted = false;
    };
  }, [debouncedCode, isDark, mermaidId]);

  return (
    <div className={styles.mermaidContainer}>
      <LazySyntaxHighlighter language="mermaid">
        {debouncedCode}
      </LazySyntaxHighlighter>

      {error ? (
        <div className={styles.mermaidError}>
          <p>Diagram render error:</p>
          <pre>{error}</pre>
        </div>
      ) : (
        <div
          ref={containerRef}
          dangerouslySetInnerHTML={{ __html: svgContent }}
          className={styles.svgContainer}
        />
      )}

      {/* 隐藏的 mermaid 锚点 */}
      <code id={mermaidId} style={{ display: "none" }}></code>
    </div>
  );
};

export default MermaidRenderer;
