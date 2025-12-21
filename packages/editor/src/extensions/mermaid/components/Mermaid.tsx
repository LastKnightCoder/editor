import { useRef, useEffect, useState } from "react";
import mermaid from "mermaid";
import { useCreation } from "ahooks";
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

  // Check if we have valid cached SVG
  const hasCachedSvg = compiledFrom === chart && !!initialSvg;

  const mermaidId = useCreation(() => {
    return `mermaid-${Math.random().toString(36).slice(2)}`;
  }, []);

  useEffect(() => {
    // If we have cached SVG that matches current chart, use it directly
    if (hasCachedSvg && ref.current) {
      ref.current.innerHTML = initialSvg!;
      setError("");
      return;
    }

    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? "dark" : "default",
      securityLevel: "loose",
      fontFamily: "monospace",
    });

    mermaid
      .render(mermaidId, chart)
      .then(({ svg }) => {
        if (ref.current) {
          ref.current.innerHTML = svg;
          setError("");
          // Save the compiled SVG
          onCompiled?.(svg, chart);
        }
      })
      .catch((e) => {
        const errorMsg = typeof e === "string" ? e : e?.message || "渲染失败";
        setError(errorMsg);
        if (ref.current) {
          ref.current.innerHTML = "";
        }
      });
  }, [chart, mermaidId, isDark, hasCachedSvg, initialSvg, onCompiled]);

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
          style={{
            width: "100%",
            padding: 20,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        ></div>
      )}
    </>
  );
};

export default Mermaid;
