/**
 * FileDropZone 单测：拖入取第一个文件并高亮 · onFiles 多选取全部 · 点击 / 回车打开文件选择 · 选择后清空 input 以便重选同一文件 · disabled 全拦。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileDropZone } from "../FileDropZone";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const file = (name: string) => new File(["x"], name, { type: "image/png" });

/** jsdom 没有 DragEvent：用普通 Event 挂一个 dataTransfer */
const dragEvent = (type: string, files: File[] = []) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files } });
  return event;
};

describe("FileDropZone", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  const render = (ui: ReactNode) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(ui));
    return container.querySelector<HTMLElement>('[role="button"]')!;
  };

  it("拖入时高亮，放下取第一个文件", () => {
    const onFile = vi.fn();
    const zone = render(<FileDropZone onFile={onFile}>拖到这里</FileDropZone>);
    act(() => void zone.dispatchEvent(dragEvent("dragover")));
    expect(zone.className).toContain("bg-accent-soft");
    act(() => void zone.dispatchEvent(dragEvent("drop", [file("a.png"), file("b.png")])));
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0].name).toBe("a.png");
    expect(zone.className).not.toContain("bg-accent-soft");
  });

  it("onFiles：放下取全部文件，文件框开启多选", () => {
    const onFiles = vi.fn();
    const zone = render(<FileDropZone onFiles={onFiles}>拖到这里</FileDropZone>);
    expect(container!.querySelector<HTMLInputElement>('input[type="file"]')!.multiple).toBe(true);
    act(() => void zone.dispatchEvent(dragEvent("drop", [file("a.png"), file("b.png")])));
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(["a.png", "b.png"]);
  });

  it("点击与回车打开文件选择；选择后清空 input，可重选同一文件", () => {
    const onFile = vi.fn();
    const zone = render(
      <FileDropZone accept="image/*" onFile={onFile}>
        点我
      </FileDropZone>
    );
    const input = container!.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept).toBe("image/*");
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    act(() => zone.click());
    act(() => {
      zone.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(click).toHaveBeenCalledTimes(2);

    Object.defineProperty(input, "files", { value: [file("c.png")], configurable: true });
    act(() => void input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onFile.mock.calls[0][0].name).toBe("c.png");
    expect(input.value).toBe("");
  });

  it("disabled：不打开选择、不接收拖入", () => {
    const onFile = vi.fn();
    const zone = render(
      <FileDropZone onFile={onFile} disabled>
        上传中
      </FileDropZone>
    );
    const click = vi
      .spyOn(container!.querySelector("input")!, "click")
      .mockImplementation(() => {});
    act(() => zone.click());
    act(() => void zone.dispatchEvent(dragEvent("drop", [file("a.png")])));
    expect(click).not.toHaveBeenCalled();
    expect(onFile).not.toHaveBeenCalled();
    expect(zone.getAttribute("aria-disabled")).toBe("true");
  });
});
