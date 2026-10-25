import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BoardCanvas, type BoardCanvasHandle } from "../components/BoardCanvas";
import type { WhiteboardSnapshot } from "@tau/whiteboard";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  changed: undefined as ((data: WhiteboardSnapshot) => void) | undefined,
}));
vi.mock("../queries", () => ({
  useWhiteBoardContent: () => ({
    data: {
      id: 1,
      name: "测试",
      data: {
        children: [],
        selection: { selectedElements: [], selectArea: null },
        viewPort: { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
      },
    },
    isPending: false,
    isError: false,
    save: { mutateAsync: mocks.save },
  }),
}));
vi.mock("@/features/shared/whiteboard/DesktopWhiteboard", () => ({
  default: ({ onChange }: { onChange(data: WhiteboardSnapshot): void }) => {
    mocks.changed = onChange;
    return null;
  },
}));
afterEach(() => vi.clearAllMocks());

it("旧快照只读，禁止保存与依赖快照保存的复制", async () => {
  mocks.save.mockRejectedValue(new Error("写入失败"));
  const host = document.createElement("div");
  const root = createRoot(host);
  const ref = createRef<BoardCanvasHandle>();
  const duplicate = vi.fn();
  try {
    await act(async () => root.render(<BoardCanvas id={1} ref={ref} />));
    expect(mocks.changed).toBeUndefined();
    expect(host.textContent).not.toContain("转换格式");
    expect(host.textContent).not.toContain("准备转换");
    const afterSave = async () => {
      await ref.current!.flush();
      duplicate();
    };
    await expect(afterSave()).rejects.toThrow("后台升级");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(duplicate).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});
