import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board } from "@tau/whiteboard";
import type { EntityCandidate } from "@/types";
import { DocumentSelectorModal } from "../components/Document/DocumentSelectorModal";

const picker = vi.hoisted(() => ({
  confirm: undefined as ((picked: EntityCandidate[]) => void) | undefined,
}));
vi.mock("@/components/EntityPicker", () => ({
  EntityPicker: ({ onConfirm }: { onConfirm(picked: EntityCandidate[]): void }) => {
    picker.confirm = onConfirm;
    return null;
  },
}));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
});

const moment = (id: number): EntityCandidate => ({
  kind: "diary-moment",
  id,
  diaryId: 5,
  contentId: 100 + id,
  title: `日记 ${id}`,
  excerpt: "",
  meta: "",
  time: 0,
});

describe("白板日记选择", () => {
  it("同一天选中两条日记时分别保存片段身份，不保存容器 id、segmentId 或 contentId", () => {
    const apply = vi.fn();
    const close = vi.fn();
    const board = {
      children: [],
      viewPort: { minX: 0, minY: 0, width: 1200, height: 800 },
      captureSubmission: () => () => true,
      apply,
    } as unknown as Board;
    act(() => root.render(<DocumentSelectorModal open board={board} onClose={close} />));
    picker.confirm?.([moment(11), moment(12)]);
    const elements = apply.mock.calls[0][0]
      .filter((operation: { type: string }) => operation.type === "insert_node")
      .map((operation: { node: Record<string, unknown> }) => operation.node);
    expect(elements.map((element: { entityRef: unknown }) => element.entityRef)).toEqual([
      { kind: "diary-moment", id: 11 },
      { kind: "diary-moment", id: 12 },
    ]);
    for (const element of elements) {
      expect(element).not.toHaveProperty("segmentId");
      expect(element).not.toHaveProperty("contentId");
    }
    expect(close).toHaveBeenCalledOnce();
  });

  it("白板已不可提交时不会插入日记", () => {
    const apply = vi.fn();
    const board = { captureSubmission: () => () => false, apply } as unknown as Board;
    act(() => root.render(<DocumentSelectorModal open board={board} onClose={vi.fn()} />));
    picker.confirm?.([moment(12)]);
    expect(apply).not.toHaveBeenCalled();
  });
});
