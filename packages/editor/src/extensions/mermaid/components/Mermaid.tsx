import { useRef, useEffect, useMemo, useState } from "react";
import { useCreation } from "ahooks";
import {
  renderMermaidWithFallback,
  type MermaidRenderPreference,
  type MermaidThemeName,
} from "@tau/shared";
import useTheme from "../../../hooks/useTheme";
import useSettings from "../../../hooks/useSettings";

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
  const settings = useSettings();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>("");
  const [displayMode, setDisplayMode] = useState<"svg" | "ascii">("svg");
  const [asciiContent, setAsciiContent] = useState<string>("");
  const [settingVersion, setSettingVersion] = useState(0);

  // Check if we have valid cached SVG
  const hasCachedSvg = compiledFrom === chart && !!initialSvg;

  useEffect(() => {
    if (!settings.subscribe) {
      return;
    }

    return settings.subscribe(() => {
      setSettingVersion((prev) => prev + 1);
    });
  }, [settings]);

  const renderPreference = useMemo<MermaidRenderPreference>(() => {
    return {
      style:
        settings.get<"svg" | "ascii-unicode">("misc.mermaid.style") || "svg",
      lightTheme:
        settings.get<MermaidThemeName>("misc.mermaid.lightTheme") ||
        "github-light",
      darkTheme:
        settings.get<MermaidThemeName>("misc.mermaid.darkTheme") ||
        "github-dark",
    };
  }, [settings, settingVersion]);

  const mermaidId = useCreation(() => {
    return `mermaid-${Math.random().toString(36).slice(2)}`;
  }, []);

  useEffect(() => {
    // 先展示缓存 SVG，再继续后台渲染，确保主题切换时可实时刷新
    if (renderPreference.style === "svg" && hasCachedSvg && ref.current) {
      ref.current.innerHTML = initialSvg!;
      setDisplayMode("svg");
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
          preference: renderPreference,
        });

        if (!isMounted) return;

        setDisplayMode(result.displayMode);
        setAsciiContent(
          result.displayMode === "ascii" ? result.displayContent : "",
        );

        if (ref.current) {
          ref.current.innerHTML =
            result.displayMode === "svg" ? result.displayContent : "";
        }

        setError("");

        if (
          result.cachedSvg &&
          onCompiled &&
          (compiledFrom !== chart || initialSvg !== result.cachedSvg)
        ) {
          onCompiled(result.cachedSvg, chart);
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
        if (ref.current) {
          ref.current.innerHTML = "";
        }
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
    hasCachedSvg,
    initialSvg,
    onCompiled,
    compiledFrom,
    renderPreference.style,
    renderPreference.lightTheme,
    renderPreference.darkTheme,
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
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
          }}
        >
          <pre
            style={{
              width: "max-content",
              margin: 0,
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
