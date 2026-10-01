import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import TabTitle from "../TabTitle";
import { TabsDragScopeContext } from "../../context";

type Item = { tabKey: string; scope: object | null };
type Drop = { canDrop: (item: Item) => boolean; drop: (item: Item) => void };
const state = vi.hoisted(() => ({
  drags: [] as { item: Item }[],
  drops: [] as Drop[],
  readonly: false,
}));
vi.mock("slate-react", () => ({ useReadOnly: () => state.readonly }));
vi.mock("react-dnd", () => ({
  useDrag: (spec: { item: Item }) => {
    state.drags.push(spec);
    return [{ isDragging: false }, () => undefined];
  },
  useDrop: (spec: Drop) => {
    state.drops.push(spec);
    return [{}, () => undefined];
  },
}));

it("拖动复制了相同 key 的另一组标签不会改动本组，只读拒绝落下", async () => {
  const host = document.createElement("div"),
    root = createRoot(host);
  const first = {},
    second = {},
    reorder = vi.fn();
  const title = (scope: object, key: string) => (
    <TabsDragScopeContext.Provider value={scope}>
      <TabTitle
        tab={{ key, title: key }}
        index={0}
        activeKey=""
        dropBefore={false}
        dropAfter={false}
        onHoverDrop={() => undefined}
        onReorder={reorder}
        onClickTab={() => undefined}
        onDeleteTab={() => undefined}
        onTitleChange={() => undefined}
      />
    </TabsDragScopeContext.Provider>
  );
  try {
    await act(async () =>
      root.render(
        <>
          {title(first, "a")}
          {title(first, "b")}
          {title(second, "b")}
        </>
      )
    );
    const item = state.drags[0].item;
    expect(state.drops[1].canDrop(item)).toBe(true);
    expect(state.drops[2].canDrop(item)).toBe(false);
    state.drops[2].drop(item);
    expect(reorder).not.toHaveBeenCalled();
    state.drops[1].drop(item);
    expect(reorder).toHaveBeenCalledWith("a", 0, true);
    reorder.mockClear();
    state.readonly = true;
    await act(async () => root.render(title(first, "b")));
    const readonlyDrop = state.drops[state.drops.length - 1];
    expect(readonlyDrop.canDrop(item)).toBe(false);
    readonlyDrop.drop(item);
    expect(reorder).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    state.drags.length = 0;
    state.drops.length = 0;
    state.readonly = false;
  }
});
