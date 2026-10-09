/**
 * 创作模式分栏壳：左白板、右正文，中间拖宽。不认识正文是文章还是项目文档。
 *
 * 进出创作模式时正文栏的子树保持不变（键控兄弟节点），正文编辑器不重新挂载；
 * 窗口放不下两栏时白板收起、只留正文。
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ResizeHandle, cn } from "@tau/ui";
import {
  BOARD_PANE_MIN,
  EDITOR_PANE_DEFAULT,
  EDITOR_PANE_MIN,
  useComposePreferences,
} from "../preferences";

export function ComposeLayout({
  active,
  board,
  children,
}: {
  /** 是否在创作模式 */
  active: boolean;
  /** 白板栏；只在创作模式下渲染 */
  board: ReactNode;
  /** 正文栏 */
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const { editorWidth, setEditorWidth } = useComposePreferences();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fits = width === 0 || width >= BOARD_PANE_MIN + EDITOR_PANE_MIN;
  const showBoard = active && fits;
  const max = Math.max(EDITOR_PANE_MIN, width - BOARD_PANE_MIN);
  const paneWidth = Math.min(max, Math.max(EDITOR_PANE_MIN, editorWidth));

  return (
    <div ref={containerRef} className="flex min-h-0 w-full flex-1">
      {showBoard && (
        <div
          key="board"
          className="bg-surface shadow-card rounded-tau-lg relative min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          {board}
        </div>
      )}
      {showBoard && (
        <ResizeHandle
          key="handle"
          value={paneWidth}
          min={EDITOR_PANE_MIN}
          max={max}
          onChange={setEditorWidth}
          side="right"
          label="正文栏宽度"
          defaultValue={EDITOR_PANE_DEFAULT}
          className="mx-0.5 shrink-0 self-stretch"
        />
      )}
      <div
        key="editor"
        className={cn("flex min-h-0 min-w-0 flex-col", showBoard ? "shrink-0" : "flex-1")}
        style={showBoard ? { width: paneWidth } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
