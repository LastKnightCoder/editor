import { useMemo } from "react";

import "./tikzjax.js";
import "./tikz.css";

interface ITikZProps {
  content: string;
  isDark?: boolean;
  className?: string;
}

const TikZ = (props: ITikZProps) => {
  const { content, isDark = false, className } = props;

  const cleanedCode = useMemo(() => {
    const tikzSource = content.split("&nbsp;").join("");

    let lines = tikzSource.split("\n");
    lines = lines.map((line) => line.trim());
    lines = lines.filter((line) => line);

    return lines.join("\n");
  }, [content]);

  if (!content.trim()) {
    return (
      <div className={className}>
        <div className="text-gray-400 dark:text-gray-500 text-center py-4">
          暂无 TikZ 内容
        </div>
      </div>
    );
  }

  const script = `<script type="text/tikz" data-show-console="true">${cleanedCode}</script>`;

  return (
    <div
      className={className}
      style={{
        filter: isDark ? "invert(1) hue-rotate(180deg)" : "none",
      }}
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
};

export default TikZ;
