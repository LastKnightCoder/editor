import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDrag } from "react-dnd";

import EnsureDndProvider from "../EnsureDndProvider";

// 与 TabTitle 相同的依赖：无 DndProvider 时 useDrag 会抛 "Expected drag drop context"
const DragConsumer = () => {
  const [{ isDragging }, dragRef] = useDrag({
    type: "test-item",
    item: { id: "1" },
    collect: monitor => ({ isDragging: monitor.isDragging() }),
  });
  return (
    <div ref={dragRef as unknown as React.Ref<HTMLDivElement>} data-testid="drag-consumer">
      {String(isDragging)}
    </div>
  );
};

describe("EnsureDndProvider", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("宿主未提供 DndProvider 时应兜底补齐，useDrag 不抛错", () => {
    expect(() =>
      act(() => {
        root.render(
          <EnsureDndProvider>
            <DragConsumer />
          </EnsureDndProvider>
        );
      })
    ).not.toThrow();
    expect(container.querySelector('[data-testid="drag-consumer"]')).not.toBeNull();
  });

  it("重复包裹时应透传而非嵌套 Provider", () => {
    expect(() =>
      act(() => {
        root.render(
          <EnsureDndProvider>
            <EnsureDndProvider>
              <DragConsumer />
            </EnsureDndProvider>
          </EnsureDndProvider>
        );
      })
    ).not.toThrow();
    expect(container.querySelectorAll('[data-testid="drag-consumer"]')).toHaveLength(1);
  });
});
