/**
 * 树谱面板（M4-d）：逐行渲染、树形语义（role=tree / aria-level）、当前分支标记、点击回调、运行中禁用。
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationTreePanel } from "../components/ConversationTreePanel";
import { layoutConversationTree } from "../conversationTree";
import type { ConversationTreeNode } from "@/types/pi-session";

const node = (id: string, parentId: string | null, patch: Partial<ConversationTreeNode> = {}) => ({
  id,
  parentId,
  text: `问题 ${id}`,
  answered: true,
  time: 1,
  onPath: false,
  omitted: false,
  ...patch,
});

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

const render = async (disabled = false, onSelect = vi.fn()) => {
  const { rows, branchCount } = layoutConversationTree([
    node("a", null, { onPath: true }),
    node("b", "a", { onPath: true }),
    node("c", "a"),
  ]);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(
      <ConversationTreePanel
        rows={rows}
        branchCount={branchCount}
        disabled={disabled}
        onSelect={onSelect}
      />
    );
  });
  return { container, onSelect };
};

describe("ConversationTreePanel", () => {
  it("按树形渲染，当前分支标记为选中，点击回调这一行", async () => {
    const { container, onSelect } = await render();
    expect(container.querySelector('[role="tree"]')).toBeTruthy();
    const items = [...container.querySelectorAll('[role="treeitem"]')];
    expect(items.map(item => item.getAttribute("aria-level"))).toEqual(["1", "2", "2"]);
    expect(items.map(item => item.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(container.textContent).toContain("2 条分支");
    expect(container.textContent).toContain("当前");

    await act(async () => items[2].querySelector("button")!.click());
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ node: expect.objectContaining({ id: "c" }) })
    );
  });

  it("回答进行中：只能看不能切", async () => {
    const { container } = await render(true);
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('[role="treeitem"] button')];
    expect(buttons.every(button => button.disabled)).toBe(true);
  });
});
