import React, { useMemo, memo } from "react";
import { RenderLeafProps } from "slate-react";
import classnames from "classnames";
import useTheme from "../../hooks/useTheme";
import styles from "./index.module.less";
import { type FormattedText as FormattedTextType } from "../../types";

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
    color = "#000",
    darkColor = "#fff",
  } = leaf;

  console.log(leaf);

  const { isDark } = useTheme();

  // 使用自定义 Hook 计算文本装饰
  const textDecorations = useTextDecorations(underline, strikethrough);

  // 计算类名
  const className = useMemo(() => {
    return classnames({
      [styles.bold]: bold,
      [styles.italic]: italic,
      [styles.padding]: true,
    });
  }, [bold, italic]);

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
      color={isDark ? darkColor : color}
    >
      {renderContent()}
    </StyledText>
  );
});

FormattedText.displayName = "FormattedText";

export default FormattedText;
