import { useRef, useEffect } from "react";
import mermaid from "mermaid";
import { useCreation } from "ahooks";
import useTheme from "@/components/Editor/hooks/useTheme";

interface IMermaidProps {
  chart: string;
}

const Mermaid = (props: IMermaidProps) => {
  const { chart } = props;
  const { isDark } = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  const mermaidId = useCreation(() => {
    return `mermaid-${Math.random().toString(36).slice(2)}`;
  }, []);

  useEffect(() => {
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
        }
      })
      .catch((e) => {
        if (ref.current) {
          ref.current.innerHTML = e;
        }
      });
  }, [chart, mermaidId, isDark]);

  return (
    <>
      <code id={mermaidId} style={{ display: "none" }}></code>
      <div ref={ref} style={{ width: "100%", padding: 20 }}></div>
    </>
  );
};

export default Mermaid;
