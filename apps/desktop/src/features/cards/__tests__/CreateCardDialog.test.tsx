import { desktopLocaleSource } from "@/app/i18n/runtime";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../queries", () => ({
  useCardsMutations: () => ({ create: { mutateAsync: mocks.create } }),
  loadCardTagSuggestions: async () => [],
}));
vi.mock("@/components/ContentEditor", () => ({
  default: ({ initValue }: { initValue: Array<{ children: Array<{ text: string }> }> }) => (
    <div data-testid="editor">{initValue[0]?.children[0]?.text}</div>
  ),
}));
vi.mock("@/components/AddTag", () => ({
  default: ({ tags, addTag }: { tags: string[]; addTag(tag: string): void }) => (
    <button onClick={() => addTag("新标签")}>标签：{tags.join(",")}</button>
  ),
}));

import { CreateCardDialog } from "../components/CreateCardDialog";

const prefill = {
  content: [{ type: "paragraph", children: [{ type: "formatted", text: "插件预填" }] }],
  tags: ["读书"],
} as never;

let host: HTMLDivElement;
let root: Root;
const render = (element: React.ReactNode) => act(async () => root.render(element));
const click = (label: string) =>
  act(async () =>
    [...document.querySelectorAll("button")]
      .find(item => item.textContent?.includes(label))
      ?.click()
  );

beforeEach(() => {
  localStorage.clear();
  mocks.create.mockReset();
  mocks.create.mockResolvedValue({ id: 5 });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("预填模式显示预填内容，保存与取消都不改动跨会话草稿", async () => {
  const draft = [{ type: "paragraph", children: [{ type: "formatted", text: "我的草稿" }] }];
  localStorage.setItem("card-edit-content", JSON.stringify(draft));
  localStorage.setItem("card-edit-tags", JSON.stringify(["草稿标签"]));
  const onCreated = vi.fn();
  const onClose = vi.fn();
  await render(<CreateCardDialog open initial={prefill} onCreated={onCreated} onClose={onClose} />);
  expect(document.body.textContent).toContain("插件预填");
  expect(document.body.textContent).toContain("标签：读书");
  await click("标签：");
  await click("保存");
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ tags: ["读书", "新标签"] }));
  expect(onCreated).toHaveBeenCalledWith({ id: 5 });
  expect(JSON.parse(localStorage.getItem("card-edit-content")!)).toEqual(draft);
  expect(JSON.parse(localStorage.getItem("card-edit-tags")!)).toEqual(["草稿标签"]);
});

it("不预填时沿用草稿，取消清空草稿", async () => {
  const draft = [{ type: "paragraph", children: [{ type: "formatted", text: "我的草稿" }] }];
  localStorage.setItem("card-edit-content", JSON.stringify(draft));
  await render(<CreateCardDialog open onClose={vi.fn()} />);
  expect(document.body.textContent).toContain("我的草稿");
  await click("取消");
  expect(JSON.parse(localStorage.getItem("card-edit-content")!)).not.toEqual(draft);
});

it("切换语言保留预填草稿、标签和编辑器节点，不保存或清空持久草稿", async () => {
  const initialLocale = desktopLocaleSource.getSnapshot();
  const stored = [{ type: "paragraph", children: [{ type: "formatted", text: "持久草稿" }] }];
  localStorage.setItem("card-edit-content", JSON.stringify(stored));
  await render(<CreateCardDialog open initial={prefill} onClose={vi.fn()} />);
  await click("标签：");
  const editor = document.querySelector('[data-testid="editor"]');
  try {
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.querySelector('[data-testid="editor"]')).toBe(editor);
      expect(document.body.textContent).toContain("插件预填");
      expect(document.body.textContent).toContain("标签：读书,新标签");
      expect(mocks.create).not.toHaveBeenCalled();
      expect(JSON.parse(localStorage.getItem("card-edit-content") ?? "null")).toEqual(stored);
    }
  } finally {
    await act(async () => desktopLocaleSource.setLocale(initialLocale));
  }
});
