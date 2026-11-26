import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
const io = vi.hoisted(() => ({ exists: vi.fn(), rename: vi.fn() }));
vi.mock("@/commands/file", () => ({
  pathExists: io.exists,
  renameFileOrDirectory: io.rename,
  createDir: vi.fn(),
  createTextFileExclusive: vi.fn(),
  showInFolder: vi.fn(),
  trashItem: vi.fn(),
}));
import { FileTree } from "../fileTree/FileTree";

async function enter(input: HTMLInputElement) {
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  );
}
async function change(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!set) throw new Error("Input value setter unavailable");
  await act(async () => {
    set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("重命名错误和进行中的操作换语保留同输入、原值/光标与单任务，不重复触碰文件", async () => {
  const originalLocale = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  const path = "/vault/原名.md",
    target = "/vault/用户新名.md";
  const pending = Promise.withResolvers<void>();
  io.exists.mockResolvedValue(false);
  io.rename.mockReturnValue(pending.promise);
  const before = vi.fn(async () => undefined),
    moved = vi.fn(),
    refresh = vi.fn(async () => undefined),
    open = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <FileTree
          rootPath="/vault"
          rows={[{ path, name: "原名.md", isDirectory: false, depth: 0, expanded: false }]}
          activePath={path}
          dirtyPath={null}
          creating={null}
          onCreatingHandled={vi.fn()}
          toggle={vi.fn()}
          reveal={vi.fn()}
          refreshDir={refresh}
          handlers={{ onOpen: open, beforeMutate: before, onMoved: moved, onRemoved: vi.fn() }}
        />
      )
    );
    const row = host.querySelector('[role="treeitem"]');
    if (!row) throw new Error("Missing file row");
    await act(async () =>
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }))
    );
    const input = host.querySelector("input");
    if (!input) throw new Error("Missing rename field");
    await change(input, "bad/name.md");
    await enter(input);
    input.setSelectionRange(1, 4);
    let previous = input.title;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    for (const locale of ["en-US", "zh-TW"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(host.querySelector("input")).toBe(input);
      expect(input.title).not.toBe(previous);
      previous = input.title;
      expect(input.value).toBe("bad/name.md");
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
      expect(io.exists).not.toHaveBeenCalled();
      expect(io.rename).not.toHaveBeenCalled();
      expect(before).not.toHaveBeenCalled();
    }
    await change(input, "用户新名.md");
    input.setSelectionRange(1, 3);
    await enter(input);
    expect(io.rename).toHaveBeenCalledExactlyOnceWith(path, target);
    expect(before).toHaveBeenCalledExactlyOnceWith(path);
    for (const locale of ["zh-CN", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      await enter(input);
      expect(host.querySelector("input")).toBe(input);
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe("用户新名.md");
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
      expect(io.exists).toHaveBeenCalledExactlyOnceWith(target);
      expect(io.rename).toHaveBeenCalledExactlyOnceWith(path, target);
      expect(moved).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    }
    await act(async () => pending.resolve());
    expect(moved).toHaveBeenCalledExactlyOnceWith(path, target);
    expect(refresh).toHaveBeenCalledExactlyOnceWith("/vault");
    expect(open).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    desktopLocaleSource.setLocale(originalLocale);
  }
});
