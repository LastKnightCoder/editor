import React, { useMemo, memo } from "react";
import { RenderLeafProps } from "slate-react";
import classnames from "classnames";
import useTheme from "../../hooks/useTheme";
import styles from "./index.module.less";
import { type FormattedText as FormattedTextType } from "../../types";
import { resolveTextGradientStyle } from "../../constants";

// 导入子组件
import { CodeText, HighlightText, StyledText } from "./components";
import { useTextDecorations } from "./hooks";
import { useMemoizedFn } from "ahooks";

interface IFormattedTextProps {
  attributes: RenderLeafProps["attributes"];
  leaf: FormattedTextType;
  children: React.ReactNode;
}

const FormattedText: React.FC<IFormattedTextProps> = memo((props) => {
  const { attributes, leaf, children } = props;
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
    return classnames({
      [styles.bold]: bold,
      [styles.italic]: italic,
      [styles.gradientText]: Boolean(resolvedGradientStyle),
      [styles.padding]: true,
    });
  }, [bold, italic, resolvedGradientStyle]);

  // 渲染内容，嵌套包装组件
  const renderContent = useMemoizedFn(() => {
    let content = children;

    // 按顺序应用样式包装
    if (code) {
      content = <CodeText isDark={isDark}>{content}</CodeText>;
    }

    if (highlight) {
      content = <HighlightText highlight={highlight}>{content}</HighlightText>;
    }

    return content;
  });

  return (
    <StyledText
      attributes={attributes}
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
