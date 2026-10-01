import React, { useMemo, memo } from "react";
import { cn } from "@tau/ui";
import { useEditorTheme as useTheme } from "@tau/editor/api";
import { type MarkRenderProps } from "@tau/editor/api";
import { resolveTextGradientStyle } from "../../palette.ts";

// 导入子组件
import { CodeText, HighlightText, StyledText } from "./components/index.ts";
import { useTextDecorations } from "./hooks/index.ts";
import { useMemoizedFn } from "ahooks";

const FormattedText: React.FC<MarkRenderProps> = memo(props => {
  const { leaf, children } = props;
  const {
    bold,
    italic,
    underline,
    highlight,
    code,
    strikethrough,
    color,
    darkColor,
    textGradient,
  } = leaf;

  const { isDark } = useTheme();

  // 使用自定义 Hook 计算文本装饰
  const textDecorations = useTextDecorations(underline, strikethrough);
  const resolvedGradientStyle = useMemo(() => {
    if (!textGradient) return null;
    return resolveTextGradientStyle(textGradient, isDark ? "dark" : "light");
  }, [isDark, textGradient]);

  // 计算类名
  const className = useMemo(() => {
    return cn(
      bold && "font-bold",
      italic && "italic",
      // 渐变字的 -webkit-text-fill-color 为 transparent，选中时恢复实色，否则选区里文字不可见
      resolvedGradientStyle && "selection:[-webkit-text-fill-color:currentColor]"
    );
  }, [bold, italic, resolvedGradientStyle]);

  // 渲染内容，嵌套包装组件
  const renderContent = useMemoizedFn(() => {
    let content = children;

    // 按顺序应用样式包装
    if (code) {
      content = <CodeText>{content}</CodeText>;
    }

    if (highlight) {
      content = <HighlightText highlight={highlight}>{content}</HighlightText>;
    }

    return content;
  });

  return (
    <StyledText
      className={className}
      textDecoration={textDecorations}
      color={resolvedGradientStyle ? undefined : isDark ? darkColor : color}
      textGradient={resolvedGradientStyle?.gradient}
      gradientFallbackColor={resolvedGradientStyle?.fallbackColor}
    >
      {renderContent()}
    </StyledText>
  );
});

FormattedText.displayName = "FormattedText";

export default FormattedText;
