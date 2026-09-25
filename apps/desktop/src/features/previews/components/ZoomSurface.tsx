/**
 * 缩放平移画布（D-057）：给静态出图的渲染器（Mermaid / PlantUML / TikZ / Typst）统一的
 * 查看手感——拖拽平移、⌘/Ctrl + 滚轮以指针为中心缩放，缩放浮控经 usePreviewActions 交给预览框。
 * 「适应」= 回到居中 100%（内容本身按容器宽度排版）。
 */

import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "@tau/ui";
import { usePreviewActions } from "./previewActions";

const MIN = 0.25;
const MAX = 4;
const STEP = 1.2;

export function ZoomSurface({ children, className }: { children: ReactNode; className?: string }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    setView(v => {
      const scale = Math.min(MAX, Math.max(MIN, v.scale * factor));
      const box = boxRef.current?.getBoundingClientRect();
      if (!box || cx === undefined || cy === undefined) return { ...v, scale };
      // 以指针为中心：指针下的内容点缩放前后不动（变换原点在容器中心）
      const ox = cx - box.left - box.width / 2;
      const oy = cy - box.top - box.height / 2;
      const k = scale / v.scale;
      return { scale, x: ox - (ox - v.x) * k, y: oy - (oy - v.y) * k };
    });
  }, []);

  usePreviewActions({
    zoom: {
      zoomIn: () => zoomAt(STEP),
      zoomOut: () => zoomAt(1 / STEP),
      fit: () => setView({ scale: 1, x: 0, y: 0 }),
      percent: Math.round(view.scale * 100),
    },
  });

  return (
    <div
      ref={boxRef}
      className={cn(
        "relative h-full cursor-grab touch-none overflow-hidden active:cursor-grabbing",
        className
      )}
      onWheel={e => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
      }}
      onPointerDown={e => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
      }}
      onPointerMove={e => {
        const d = drag.current;
        if (d) setView(v => ({ ...v, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
      }}
      onPointerUp={() => (drag.current = null)}
      onLostPointerCapture={() => (drag.current = null)}
    >
      <div
        className="flex min-h-full items-center justify-center p-6"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: "50% 50%",
        }}
      >
        {children}
      </div>
    </div>
  );
}
