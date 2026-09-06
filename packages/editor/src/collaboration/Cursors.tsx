import { memo } from "react";
import { useRemoteCursorOverlayPositions } from "@slate-yjs/react";
import type { RefObject } from "react";
import { memberColor } from "@tau/collaboration";

const LABEL_MAX_WIDTH = 160;
const DEFAULT_COLOR = "oklch(0.62 0.11 185)";

type CursorUser = { id?: string; name: string; color: string };

const CollaborationCursors = memo(function CollaborationCursors({
  containerRef,
}: {
  containerRef: RefObject<HTMLDivElement>;
}) {
  const [cursors] = useRemoteCursorOverlayPositions<CursorUser>({ containerRef });
  const containerWidth = containerRef.current?.clientWidth || LABEL_MAX_WIDTH;
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
                      bottom: "100%",
                      left: Math.max(
                        -cursor.caretPosition.left,
                        Math.min(-2, containerWidth - cursor.caretPosition.left - LABEL_MAX_WIDTH)
                      ),
                      marginBottom: 3,
                      padding: "3px 8px",
                      borderRadius: "7px 7px 7px 2px",
                      fontSize: 11.5,
                      fontWeight: 500,
                      lineHeight: 1.4,
                      color: "white",
                      background: color,
                      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
                      whiteSpace: "nowrap",
                      maxWidth: Math.min(LABEL_MAX_WIDTH, containerWidth),
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
