import { useEffect, useRef, memo, useMemo } from "react";
import { Editor } from "@tau/editor/src";
import type { MeasurableElement } from "./useWhiteBoardMeasurements";

// 最大宽度限制 - 根据文本长度动态调整
// 中文字符约 14px，加上 padding 24px (左右各12px)
const getMaxWidth = (text: string) => {
  // 估算单行显示所需宽度
  const charCount = text.length;
  // 中文约 14px，英文约 8px，取平均 12px
  const estimatedWidth = charCount * 12 + 24; // 24 = padding

  // 限制在合理范围内
  // 短文本：单行显示
  // 长文本：允许换行，但限制最大宽度
  if (estimatedWidth <= 120) return 120;
  if (estimatedWidth <= 200) return estimatedWidth;
  if (estimatedWidth <= 350) return Math.min(350, estimatedWidth);
  return 400; // 超长文本允许换行
};

// 最小尺寸
const MIN_WIDTH = 60;
const MIN_HEIGHT = 40;

interface WhiteBoardMeasureElementProps {
  element: MeasurableElement;
  hash: string;
  isDark: boolean;
  onMeasured: (
    id: string,
    size: { width: number; height: number },
    hash: string,
  ) => void;
}

const WhiteBoardMeasureElement = memo(
  ({ element, hash, isDark, onMeasured }: WhiteBoardMeasureElementProps) => {
    const wrapperRef = useRef<HTMLDivElement>(null);

    const editorTheme = useMemo(() => (isDark ? "dark" : "light"), [isDark]);

    useEffect(() => {
      const el = wrapperRef.current;
      if (!el) return;

      const textMaxWidth = getMaxWidth(element.text);

      const measure = (entry?: ResizeObserverEntry) => {
        if (!el) return;
        const width = entry?.borderBoxSize?.[0]?.inlineSize || el.offsetWidth;
        const height = entry?.borderBoxSize?.[0]?.blockSize || el.offsetHeight;

        if (!width || !height) return;

        // 加上 1px 避免亚像素渲染导致的文本换行问题
        const finalWidth = Math.max(
          MIN_WIDTH,
          Math.min(textMaxWidth, Math.ceil(width) + 1),
        );
        const finalHeight = Math.max(MIN_HEIGHT, Math.ceil(height));

        onMeasured(
          element.id,
          {
            width: finalWidth,
            height: finalHeight,
          },
          hash,
        );
      };

      const resizeObserver = new ResizeObserver((entries) => {
        measure(entries[0]);
      });
      resizeObserver.observe(el);

      const raf = requestAnimationFrame(() => measure());

      return () => {
        resizeObserver.disconnect();
        cancelAnimationFrame(raf);
      };
    }, [element.id, element.text, hash, onMeasured]);

    // 动态计算最大宽度
    const maxWidth = useMemo(() => getMaxWidth(element.text), [element.text]);

    // 与 Geometry 组件的 textContainer 样式一致
    const containerStyle = useMemo(() => {
      const baseStyle: React.CSSProperties = {
        padding: 12,
        maxWidth,
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
      };

      // 根据对齐方式设置样式
      switch (element.textAlign) {
        case "left":
          baseStyle.justifyContent = "flex-start";
          baseStyle.textAlign = "left";
          break;
        case "right":
          baseStyle.justifyContent = "flex-end";
          baseStyle.textAlign = "right";
          break;
        case "center":
        default:
          baseStyle.justifyContent = "center";
          baseStyle.textAlign = "center";
          break;
      }

      return baseStyle;
    }, [element.textAlign, maxWidth]);

    return (
      <div ref={wrapperRef} style={containerStyle}>
        <div className="pointer-events-none **:data-slate-editor:outline-none [&_.slate-Editor]:bg-transparent">
          <Editor
            initValue={element.textContent}
            readonly
            theme={editorTheme}
          />
        </div>
      </div>
    );
  },
);

WhiteBoardMeasureElement.displayName = "WhiteBoardMeasureElement";

export default WhiteBoardMeasureElement;
