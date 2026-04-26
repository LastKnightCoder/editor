import { useRef, useEffect, useState } from "react";
import { useCreation, useMemoizedFn } from "ahooks";
import {
  renderMermaidWithFallback,
  type MermaidRenderStyle,
  type MermaidThemeName,
} from "@tau/shared";
import useTheme from "../../../hooks/useTheme";
import useSettings from "../../../hooks/useSettings";

interface IMermaidProps {
  chart: string;
  /** Optional per-block render style. Undefined means following global setting */
  renderStyleOverride?: MermaidRenderStyle;
  /** Cached SVG from previous render */
  initialSvg?: string;
  /** The chart code that was used to generate the cached SVG */
  compiledFrom?: string;
  /** Callback when SVG is compiled */
  onCompiled?: (svg: string, compiledFrom: string) => void;
}

const Mermaid = (props: IMermaidProps) => {
  const { chart, renderStyleOverride, initialSvg, compiledFrom, onCompiled } =
    props;
  const { isDark } = useTheme();
  const settings = useSettings();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>("");
  const [displayMode, setDisplayMode] = useState<"svg" | "ascii">("svg");
  const [svgContent, setSvgContent] = useState<string>("");
  const [asciiContent, setAsciiContent] = useState<string>("");
  const [, setSettingVersion] = useState(0);

  const stableOnCompiled = useMemoizedFn(onCompiled ?? (() => {}));

  const initialSvgRef = useRef(initialSvg);
  const compiledFromRef = useRef(compiledFrom);
  initialSvgRef.current = initialSvg;
  compiledFromRef.current = compiledFrom;

  useEffect(() => {
    if (!settings.subscribe) {
      return;
    }

    return settings.subscribe(() => {
      setSettingVersion((prev) => prev + 1);
    });
  }, [settings]);

  const renderStyle =
    renderStyleOverride ??
    settings.get<MermaidRenderStyle>("misc.mermaid.style") ??
    "svg";
  const lightTheme =
    settings.get<MermaidThemeName>("misc.mermaid.lightTheme") || "github-light";
  const darkTheme =
    settings.get<MermaidThemeName>("misc.mermaid.darkTheme") || "github-dark";
  const useBeautifulMermaid =
    settings.get<boolean>("misc.mermaid.useBeautifulMermaid") ?? true;

  const mermaidId = useCreation(() => {
    return `mermaid-${Math.random().toString(36).slice(2)}`;
  }, []);

  useEffect(() => {
    // Capture ref values at the time this effect runs, before any async work
    const cachedSvg = initialSvgRef.current;
    const cachedFrom = compiledFromRef.current;
    const hasCachedSvg = cachedFrom === chart && !!cachedSvg;

    // 先展示缓存 SVG，再继续后台渲染，确保主题切换时可实时刷新
    if (renderStyle === "svg" && hasCachedSvg && cachedSvg) {
      setDisplayMode("svg");
      setSvgContent(cachedSvg);
      setAsciiContent("");
      setError("");
    }

    let isMounted = true;

    const renderMermaid = async () => {
      try {
        const result = await renderMermaidWithFallback({
          code: chart,
          mermaidId,
          isDark,
          preference: {
            style: renderStyle,
            lightTheme,
            darkTheme,
            useBeautifulMermaid,
          },
        });

        if (!isMounted) return;

        setDisplayMode(result.displayMode);
        setAsciiContent(
          result.displayMode === "ascii" ? result.displayContent : "",
        );
        setSvgContent(result.cachedSvg || "");

        setError("");

        if (
          result.cachedSvg &&
          (cachedFrom !== chart || cachedSvg !== result.cachedSvg)
        ) {
          stableOnCompiled(result.cachedSvg, chart);
        }
      } catch (e: unknown) {
        if (!isMounted) return;
        const errorMsg =
          typeof e === "string"
            ? e
            : e instanceof Error
              ? e.message
              : "渲染失败";
        setError(errorMsg);
        setSvgContent("");
      }
    };

    renderMermaid();

    return () => {
      isMounted = false;
    };
  }, [
    chart,
    mermaidId,
    isDark,
    renderStyle,
    lightTheme,
    darkTheme,
    useBeautifulMermaid,
    stableOnCompiled,
  ]);

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
      ) : displayMode === "ascii" ? (
        <div
          style={{
            width: "100%",
            overflowX: "auto",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "fit-content",
              minWidth: "100%",
              margin: "0 auto",
            }}
          >
            <pre
              style={{
                display: "block",
                width: "max-content",
                margin: "0 auto",
                fontFamily:
                  "'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                fontSize: "13px",
                lineHeight: 1.4,
                textAlign: "left",
                color: isDark ? "#e5e7eb" : "#111827",
              }}
            >
              {asciiContent}
            </pre>
          </div>
        </div>
      ) : (
        <div
          ref={ref}
          dangerouslySetInnerHTML={{ __html: svgContent }}
          style={{
            width: "100%",
            padding: 20,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        />
      )}
    </>
  );
};

export default Mermaid;
