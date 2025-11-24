import { memo } from "react";
import type { RenderElementProps } from "slate-react";
import type { WeReadChapterElement } from "../../types/elements";
import useTheme from "@/hooks/useTheme";

export const Chapter: React.FC<RenderElementProps> = memo((props) => {
  const { attributes, children, element } = props;
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const chapterElement = element as any as WeReadChapterElement;
  const { chapterTitle, level } = chapterElement;

  const borderColor = isDark ? "#2a2a2a" : "#e8e8e8";
  const titleColor = isDark ? "#e0e0e0" : "#262626";

  // 根据层级调整标题样式
  const fontSize = level === 0 ? "20px" : level === 1 ? "18px" : "16px";
  const fontWeight = level === 0 ? "bold" : level === 1 ? "600" : "500";
  const marginBottom = level === 0 ? "20px" : "16px";

  return (
    <div
      {...attributes}
      style={{
        marginBottom: "32px",
      }}
    >
      {/* 章节标题 - 不可编辑 */}
      <div
        contentEditable={false}
        style={{
          fontSize,
          fontWeight,
          color: titleColor,
          marginBottom,
          paddingBottom: "12px",
          borderBottom: `2px solid ${borderColor}`,
        }}
      >
        {chapterTitle}
      </div>

      {/* 章节内容 - 包含书签 */}
      <div style={{ marginTop: "16px" }}>{children}</div>
    </div>
  );
});

Chapter.displayName = "Chapter";
