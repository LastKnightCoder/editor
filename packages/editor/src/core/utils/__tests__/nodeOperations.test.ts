import type { Node } from "slate";
import { createEditor } from "slate";
import { afterEach, describe, expect, it, vi } from "vitest";

import { copyNodeToClipboard } from "../nodeOperations";

class FakeClipboardItem {
  constructor(public readonly items: Record<string, Blob>) {}
}

const paragraph = (text: string): Node =>
  ({ type: "paragraph", children: [{ type: "formatted", text }] }) as unknown as Node;

// jsdom 的 Blob 没有 text()，经 FileReader 读取
const readBlob = (blob: Blob) =>
  new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

const decodeFragment = async (blob: Blob) =>
  JSON.parse(decodeURIComponent(window.atob(await readBlob(blob))));

const installClipboard = () => {
  const write = vi.fn(async (_items: FakeClipboardItem[]) => {});
  const writeText = vi.fn(async (_text: string) => {});
  vi.stubGlobal("navigator", { clipboard: { write, writeText } });
  vi.stubGlobal(
    "ClipboardItem",
    Object.assign(FakeClipboardItem, {
      supports: (type: string) => type.startsWith("application/"),
    })
  );
  return { write, writeText };
};

describe("copyNodeToClipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("单节点写入只含该节点的 fragment", async () => {
    const { write } = installClipboard();
    const node = paragraph("第一段");

    await expect(copyNodeToClipboard(createEditor(), node)).resolves.toBe(true);

    const item = write.mock.calls[0][0][0];
    expect(await readBlob(item.items["text/plain"])).toBe("第一段");
    expect(await decodeFragment(item.items["application/x-slate-fragment"])).toEqual([node]);
  });

  it("多节点按顺序写入同一个 fragment，纯文本以换行连接", async () => {
    const { write } = installClipboard();
    const nodes = [paragraph("甲"), paragraph(""), paragraph("丙")];
    const success = vi.fn();

    await expect(
      copyNodeToClipboard(createEditor(), nodes, { success, error: vi.fn() } as never)
    ).resolves.toBe(true);

    const item = write.mock.calls[0][0][0];
    expect(await readBlob(item.items["text/plain"])).toBe("甲\n\n丙");
    expect(await decodeFragment(item.items["application/x-slate-fragment"])).toEqual(nodes);
    expect(success).toHaveBeenCalledWith("复制成功");
  });

  it("富格式写入失败时多节点降级为换行连接的纯文本", async () => {
    const { write, writeText } = installClipboard();
    write.mockRejectedValueOnce(new Error("denied"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      copyNodeToClipboard(createEditor(), [paragraph("甲"), paragraph("乙")])
    ).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("甲\n乙");
  });
});
