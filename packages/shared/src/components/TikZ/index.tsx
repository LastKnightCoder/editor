import { useEffect, useMemo, useRef } from "react";

import "./tikzjax.js";
import "./tikz.css";

interface ITikZProps {
  content: string;
  isDark?: boolean;
  className?: string;
}

const TikZ = (props: ITikZProps) => {
  const { content, isDark = false, className } = props;
  const containerRef = useRef<HTMLDivElement>(null);

  const cleanedCode = useMemo(() => {
    const tikzSource = content.split("&nbsp;").join("");

    let lines = tikzSource.split("\n");
    lines = lines.map((line) => line.trim());
    lines = lines.filter((line) => line);

    return lines.join("\n");
  }, [content]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !cleanedCode) {
      return;
    }

    container.replaceChildren();

    const script = document.createElement("script");
    script.type = "text/tikz";
    script.textContent = cleanedCode;
    container.appendChild(script);

    return () => {
      container.replaceChildren();
    };
  }, [cleanedCode]);

  if (!content.trim()) {
    return (
      <div className={className}>
        <div className="text-gray-400 dark:text-gray-500 text-center py-4">
          暂无 TikZ 内容
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        filter: isDark ? "invert(1) hue-rotate(180deg)" : "none",
      }}
    />
  );
};

export default TikZ;
