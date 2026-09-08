import { useEffect, useMemo, useRef } from "react";

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
    lines = lines.map(line => line.trim());
    lines = lines.filter(line => line);

    return lines.join("\n");
  }, [content]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !cleanedCode) {
      return;
    }

    // tikzjax 为超大体积（transform 后 20MB+）的浏览器脚本，静态 import 会拖入首屏
    // 模块图，Electron 渲染进程编译该模块时永久挂起导致整页白屏，故改为按需加载
    let cancelled = false;
    void import("./tikzjax.js").then(() => {
      if (cancelled) {
        return;
      }
      container.replaceChildren();
      const script = document.createElement("script");
      script.type = "text/tikz";
      script.textContent = cleanedCode;
      container.appendChild(script);
    });

    return () => {
      cancelled = true;
      container.replaceChildren();
    };
  }, [cleanedCode]);

  if (!content.trim()) {
    return (
      <div className={className}>
        <div className="py-4 text-center text-gray-400 dark:text-gray-500">暂无 TikZ 内容</div>
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
