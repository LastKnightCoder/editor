import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import type { PluginBatchRegistrations } from "@embedpdf/core";
import type { Note, Pdf } from "@/types";
import { desktopLocaleSource } from "@/app/i18n/runtime";

const boundary = vi.hoisted(() => ({
  read: vi.fn(),
  resolve: vi.fn(),
  statuses: vi.fn(),
  ensure: vi.fn(),
  engine: {},
}));
vi.mock("@/commands", () => ({
  readBinaryFile: boundary.read,
  getPdfIndexStatuses: boundary.statuses,
  ensurePdfIndex: boundary.ensure,
  rebuildPdfIndex: vi.fn(),
  addPdfAnnotation: vi.fn(),
  addPdfBookmark: vi.fn(),
  getPdfAnnotations: vi.fn(),
  getPdfBookmarks: vi.fn(),
  removePdfAnnotation: vi.fn(),
  removePdfBookmark: vi.fn(),
  updatePdfAnnotation: vi.fn(),
}));
vi.mock("../../queries", () => ({
  useDatabaseReady: () => ({ database: "original.db", ready: true }),
  resolvePdfPath: boundary.resolve,
}));
vi.mock("@embedpdf/engines/react", () => ({
  usePdfiumEngine: () => ({ engine: boundary.engine, error: null }),
}));
let registrations: PluginBatchRegistrations | undefined;
vi.mock("@embedpdf/core/react", () => ({
  // Simulate only the foreign engine host; PdfReader, file/query/index hooks, and plugin registration are real.
  EmbedPDF: ({
    plugins,
    children,
  }: {
    plugins: PluginBatchRegistrations;
    children: (state: { pluginsReady: boolean }) => ReactNode;
  }) => {
    registrations = plugins;
    const [page, setPage] = useState(7);
    return (
      <section>
        <button type="button" onClick={() => setPage(page + 1)} />
        <output>{page}</output>
        {children({ pluginsReady: true })}
      </section>
    );
  },
}));
vi.mock("../ReaderLayout", () => ({ ReaderLayout: () => null }));
vi.mock("@/services/editorKit", () => ({ getDescriptionKit: () => ({}) }));
vi.mock("@/page/PageProvider", () => ({ useOverlayDismiss: () => undefined }));
vi.mock("@tau/editor", () => ({
  Editor: ({
    initValue,
    onChange,
  }: {
    initValue: Descendant[];
    onChange: (value: Descendant[]) => void;
  }) => (
    <textarea
      value={JSON.stringify(initValue)}
      onChange={event => onChange(JSON.parse(event.target.value))}
    />
  ),
}));

import { PdfReader } from "../PdfReader";
import { NoteCard } from "../components/NoteCard";

const pdf: Pdf = {
  id: 24,
  updateTime: 1,
  createTime: 1,
  fileName: "原始文件.pdf",
  filePath: "/raw/original.pdf",
  remoteUrl: "",
  isLocal: true,
  category: "",
  tags: [],
};
const status = { pdfId: pdf.id, state: "ready", pageCount: 12, updatedAt: 1 };
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let original: string;
beforeEach(() => {
  vi.useFakeTimers();
  original = desktopLocaleSource.getSnapshot();
  registrations = undefined;
  boundary.read.mockResolvedValue(Uint8Array.of(1, 2));
  boundary.resolve.mockResolvedValue(pdf.filePath);
  boundary.statuses.mockResolvedValue([status]);
  boundary.ensure.mockResolvedValue(status);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  desktopLocaleSource.setLocale(original);
  vi.clearAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

it("换语不重读文件、重建注册或重启索引，保留外部阅读实例的页码", async () => {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <PdfReader pdf={pdf} />
      </QueryClientProvider>
    )
  );
  await act(async () => {
    await vi.waitFor(() => expect(boundary.ensure).toHaveBeenCalledTimes(1));
  });
  const button = host.querySelector("button");
  if (!button || !registrations) throw new Error("阅读器尚未就绪");
  act(() => button.click());
  const instance = host.querySelector("output");
  const plugins = registrations;
  const queries = client
    .getQueryCache()
    .getAll()
    .map(query => query.queryKey);
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(host.querySelector("output")).toBe(instance);
    expect(instance?.textContent).toBe("8");
    expect(registrations).toBe(plugins);
    expect(boundary.read).toHaveBeenCalledExactlyOnceWith(pdf.filePath);
    expect(boundary.resolve).toHaveBeenCalledExactlyOnceWith(pdf);
    expect(boundary.ensure).toHaveBeenCalledTimes(1);
    expect(
      client
        .getQueryCache()
        .getAll()
        .map(query => query.queryKey)
    ).toEqual(queries);
  }
});

it("换语保留未保存批注树与编辑器实例，进行中的保存不重放", async () => {
  let finish: (() => void) | undefined;
  const save = vi.fn<(notes: Note[]) => Promise<void>>(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  const cancel = vi.fn();
  await act(async () =>
    root.render(<NoteCard record={null} draftPage={7} onSave={save} onCancel={cancel} />)
  );
  const editor = host.querySelector("textarea");
  if (!editor) throw new Error("批注编辑器未挂载");
  const draft = [
    { type: "paragraph", children: [{ type: "formatted", text: "用户原始笔记", bold: true }] },
  ];
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      editor,
      JSON.stringify(draft)
    );
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.focus();
  });
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(host.querySelector("textarea")).toBe(editor);
    expect(JSON.parse(editor.value)).toEqual(draft);
    expect(document.activeElement).toBe(editor);
    expect(save).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  }
  await act(async () =>
    editor.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })
    )
  );
  await act(async () => desktopLocaleSource.setLocale("zh-CN"));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0][0].note).toEqual(draft);
  expect(save.mock.calls[0][0][0].id).toEqual(expect.any(String));
  expect(host.querySelector("textarea")).toBe(editor);
  expect(JSON.parse(editor.value)).toEqual(draft);
  if (!finish) throw new Error("保存未进入命令边界");
  await act(async () => finish?.());
  expect(save).toHaveBeenCalledTimes(1);
});
