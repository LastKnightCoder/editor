import { memo } from "react";
import { useRemoteCursorOverlayPositions } from "@slate-yjs/react";
import type { CSSProperties, RefObject } from "react";
import { memberColor } from "@tau/collaboration";

const LABEL_MAX_WIDTH = 160;
const DEFAULT_COLOR = "oklch(0.62 0.11 185)";
// 标签固定样式推导的高度：11.5px 字号 × 1.4 行高 + 上下 padding 6px，向上取整留余量
const LABEL_HEIGHT = 23;
const LABEL_GAP = 3;

type CursorUser = { id?: string; name: string; color: string };

// 标签默认在光标上方；第一行放不下时翻转到下方，上下都放不下（单行文档）时退到光标右侧，
// 避免被外层 overflow 容器截断。光标靠近右边缘时改为标签右边对齐光标（用 right 定位），
// 不能按 LABEL_MAX_WIDTH 估算左移，否则短名字会被推得离光标很远。
function getLabelPlacementStyle(
  caret: { top: number; left: number; height: number },
  containerWidth: number,
  containerHeight: number
): CSSProperties {
  const fitsAbove = caret.top >= LABEL_HEIGHT + LABEL_GAP;
  const fitsBelow = containerHeight - caret.top - caret.height >= LABEL_HEIGHT + LABEL_GAP;
  if (!fitsAbove && !fitsBelow) {
    return { top: 0, left: 4, borderRadius: 7 };
  }
  const alignRight = caret.left + LABEL_MAX_WIDTH > containerWidth;
  const horizontal: CSSProperties = alignRight
    ? { right: 0, maxWidth: Math.min(LABEL_MAX_WIDTH, caret.left + 2) }
    : { left: -2, maxWidth: Math.min(LABEL_MAX_WIDTH, containerWidth) };
  const tail = alignRight ? "7px" : "2px";
  const tailOpposite = alignRight ? "2px" : "7px";
  return fitsAbove
    ? {
        bottom: "100%",
        marginBottom: LABEL_GAP,
        ...horizontal,
        borderRadius: `7px 7px ${tailOpposite} ${tail}`,
      }
    : {
        top: "100%",
        marginTop: LABEL_GAP,
        ...horizontal,
        borderRadius: `${tail} ${tailOpposite} 7px 7px`,
      };
}

const CollaborationCursors = memo(function CollaborationCursors({
  containerRef,
}: {
  containerRef: RefObject<HTMLDivElement>;
}) {
  const [cursors] = useRemoteCursorOverlayPositions<CursorUser>({ containerRef });
  const container = containerRef.current;
  const containerWidth = container?.clientWidth || LABEL_MAX_WIDTH;
  const containerHeight = container?.clientHeight || 0;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {cursors
        .filter(
          cursor =>
            (cursor.caretPosition && cursor.caretPosition.height > 0) ||
            cursor.selectionRects.length > 0
        )
        .map(cursor => {
          // 以设备 ID 派生颜色，与头像保持一致；旧数据回退到下发的 color 字段。
          const color = cursor.data?.id
            ? memberColor(cursor.data.id)
            : cursor.data?.color || DEFAULT_COLOR;
          return (
            <div key={cursor.clientId}>
              {cursor.selectionRects.map((rect, index) => (
                <div
                  key={index}
                  style={{
                    ...rect,
                    position: "absolute",
                    background: color,
                    opacity: 0.16,
                  }}
                />
              ))}
              {cursor.caretPosition && cursor.caretPosition.height > 0 && (
                <div
                  data-collaboration-cursor={cursor.clientId}
                  style={{
                    ...cursor.caretPosition,
                    position: "absolute",
                    borderLeft: `2px solid ${color}`,
                  }}
                >
                  <span
                    className="animate-fadeIn"
                    style={{
                      position: "absolute",
                      ...getLabelPlacementStyle(
                        cursor.caretPosition,
                        containerWidth,
                        containerHeight
                      ),
                      padding: "3px 8px",
                      fontSize: 11.5,
                      fontWeight: 500,
                      lineHeight: 1.4,
                      color: "white",
                      background: color,
                      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {cursor.data?.name || "协作者"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
});

export default CollaborationCursors;
