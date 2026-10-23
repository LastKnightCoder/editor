import { afterEach, expect, it, vi } from "vitest";
import { createEditor, Transforms } from "slate";
import { createMarkdownDocument } from "../markdownDocument";
import { getMarkdown } from "@/utils/markdown";

vi.mock("@/utils/markdown", async importOriginal => {
  const actual = await importOriginal<typeof import("@/utils/markdown")>();
  return { ...actual, getMarkdown: vi.fn(actual.getMarkdown) };
});

afterEach(() => vi.clearAllMocks());

it("五万字正文使用增量转换，重复保存读取不触发全量转换", async () => {
  const file = createMarkdownDocument();
  const binding = file.document.binding;
  if (!binding) throw new Error("文档绑定未创建");
  const editor = binding.install(createEditor());
  try {
    const raw = Array.from({ length: 500 }, (_, index) => `${index}`.padEnd(100, "文")).join(
      "\n\n"
    );
    file.applyMarkdown(raw, "external");
    binding.connect(editor);
    await Promise.resolve();
    vi.mocked(getMarkdown).mockClear();
    const started = performance.now();
    Transforms.insertText(editor, "新", { at: { path: [0, 0], offset: 1 } });
    expect(file.getText()).toContain("0新文");
    await Promise.resolve();
    const editMs = performance.now() - started;
    const editConversions = vi.mocked(getMarkdown).mock.calls.length;
    vi.mocked(getMarkdown).mockClear();
    const readsStarted = performance.now();
    for (let index = 0; index < 10; index++) file.getText();
    const readsMs = performance.now() - readsStarted;
    const readConversions = vi.mocked(getMarkdown).mock.calls.length;
    console.info("[markdown-document]", {
      characters: 50_000,
      editMs,
      editConversions,
      readsMs,
      readConversions,
    });
    expect(editConversions).toBe(0);
    expect(readConversions).toBe(0);
    expect(file.getText()).toContain("0新文");
  } finally {
    file.dispose();
  }
});
