import type { BoardElement } from "../types";

export function UnknownElement({
  element,
  children,
}: {
  element: BoardElement;
  children?: React.ReactNode;
}) {
  const valid = [element.x, element.y, element.width, element.height].every(Number.isFinite);
  return (
    <g data-unknown-element={element.id}>
      {valid && (
        <foreignObject
          x={element.x}
          y={element.y}
          width={Math.max(1, element.width)}
          height={Math.max(1, element.height)}
        >
          <div className="bg-surface border-line-1 text-ink-3 text-tau-meta flex size-full items-center justify-center border">
            {element.name || element.title || element.type} · 扩展不可用
          </div>
        </foreignObject>
      )}
      {children}
    </g>
  );
}
