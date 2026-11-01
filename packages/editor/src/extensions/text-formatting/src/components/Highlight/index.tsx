import React, { useMemo } from "react";
import { useEditorTheme } from "@tau/editor/api";
import { inlineHighlight } from "../../inline-palette.ts";
import { useHighlightStyle } from "../../highlightStyle.ts";
import type { HighlightColor, HighlightStyle } from "../../types.ts";
import { markerTiles } from "./marker.ts";

interface IHighlightProps {
  type?: HighlightColor;
  /** 指定笔触（设置页预览用）；缺省取编辑器作用域注册的笔触 */
  variant?: HighlightStyle;
}

/**
 * 高亮取统一行内色板，随明暗切换；未知色值（历史数据）不画高亮。
 * 平涂 = 同色相淡底 + 底线；其余笔触是三张背景切片，布局规则在 styles.css 的 .ed-marker。
 */
const Highlight: React.FC<React.PropsWithChildren<IHighlightProps>> = props => {
  const { type = "yellow", variant, children } = props;
  const scopedStyle = useHighlightStyle();
  const style = variant ?? scopedStyle;
  const { isDark } = useEditorTheme();

  const markerStyle = useMemo(() => {
    if (style === "flat") return undefined;
    const tiles = markerTiles(style, type, isDark);
    if (!tiles) return undefined;
    return {
      "--ed-marker-left": tiles.left,
      "--ed-marker-mid": tiles.mid,
      "--ed-marker-right": tiles.right,
      "--ed-marker-mid-size": tiles.midSize,
      mixBlendMode: isDark ? undefined : "multiply",
    } as React.CSSProperties;
  }, [style, type, isDark]);

  if (style !== "flat") {
    return markerStyle ? (
      <span className="ed-marker" data-ed-highlight="" style={markerStyle}>
        {children}
      </span>
    ) : (
      <>{children}</>
    );
  }

  const colors = inlineHighlight(type);
  return (
    <span
      className={colors ? "border-b-2 border-solid" : undefined}
      style={
        colors ? { backgroundColor: colors.background, borderBottomColor: colors.line } : undefined
      }
    >
      {children}
    </span>
  );
};

export default Highlight;
