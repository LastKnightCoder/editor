import { useMemo } from "react";

/**
 * 计算文本装饰样式
 * @param underline 是否下划线
 * @param strikethrough 是否删除线
 * @returns 文本装饰样式字符串
 */
export const useTextDecorations = (
  underline?: boolean,
  strikethrough?: boolean,
) => {
  return useMemo(() => {
    let text = "";
    if (underline) {
      text += "underline ";
    }
    if (strikethrough) {
      text += "line-through ";
    }
    return text;
  }, [underline, strikethrough]);
};
