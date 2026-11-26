import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DocumentHistoryEntry, DocumentHistoryPreview } from "@tau/collaboration";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { useContentHistory, type ContentHistoryController } from "../useContentHistory";
import { HistoryPanel } from "../HistoryPanel";
import { useHistoryI18n } from "../i18n";
const native = vi.hoisted(() => ({ list: vi.fn(), preview: vi.fn(), apply: vi.fn(), mounts: 0 }));
vi.mock("@/commands/contracts/collaboration", () => {
  const api = {
    historyList: { call: native.list },
    historyPreview: { call: native.preview },
    historyApply: { call: native.apply },
  };
  return { collaborationCommands: api, localContentCommands: api };
});
vi.mock("@/page/PageProvider", () => ({ useOverlayDismiss: () => undefined }));
vi.mock("../HistoryLinks", () => ({ HistoryLinks: () => null }));
vi.mock("@/components/ContentEditor", () => ({
  default: function HistoricalEditor({ initValue }: { initValue: unknown[] }) {
    useEffect(() => {
      native.mounts++;
    }, []);
    return (
      <textarea readOnly data-testid="historical-body" defaultValue={JSON.stringify(initValue)} />
    );
  },
}));
const entry = (sequence: number, actorId: string): DocumentHistoryEntry => ({
  sequence,
  operationId: `operation-${sequence}`,
  actorId,
  actorName: `${actorId}原名`,
  time: 1700000000000 + sequence,
  kind: "edit",
  source: "用户原始原因",
});
const rows = [entry(2, "new-author"), entry(1, "old-author")];
const body = [
  {
    type: "paragraph",
    collabId: "block-raw",
    children: [{ collabId: "text-raw", text: "用户历史正文原文" }],
  },
];
const preview = (sequence: number): DocumentHistoryPreview => ({
  entry: rows.find(row => row.sequence === sequence) ?? rows[0],
  value: { title: "用户历史标题", bannerBg: "raw-banner", bannerPosition: "0.5", content: body },
  contracts: {},
  changes: [],
  headRevision: "a".repeat(64),
  canRestore: true,
  canUndo: true,
});
let root: Root, host: HTMLDivElement, client: QueryClient, locale: string;
let controller: ContentHistoryController | undefined,
  words: ReturnType<typeof useHistoryI18n> | undefined;
const getEditor = () => undefined;
function Probe() {
  controller = useContentHistory({ sharedDocumentId: "document-raw", getEditor });
  words = useHistoryI18n();
  return <HistoryPanel history={controller} containerRef={{ current: host }} />;
}
function current() {
  if (!controller || !words) throw new Error("历史控制器未挂载");
  return { history: controller, view: words };
}
function button(key: "fullText" | "restore" | "confirm.restore") {
  const text = current().view.t(key);
  const result = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    item => item.textContent?.trim() === text
  );
  if (!result) throw new Error("历史操作未挂载");
  return result;
}
async function settle() {
  await act(async () => vi.advanceTimersByTimeAsync(1));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  native.mounts = 0;
  controller = undefined;
  words = undefined;
  native.list.mockReset().mockResolvedValue(rows);
  native.preview.mockReset().mockImplementation(async (_id, sequence) => preview(sequence));
  native.apply.mockReset();
  locale = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  desktopLocaleSource.setLocale(locale);
  host.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
});
async function mount() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>
    )
  );
  await act(async () => current().history.open());
  await settle();
  await settle();
  await act(async () => current().history.select(1));
  await settle();
  await settle();
}
it("历史作者筛选与全文查看换语不重查、不重建正文或改变原始记录", async () => {
  await mount();
  await act(async () => current().history.setFilterActor("old-author"));
  await act(async () => button("fullText").click());
  const editor = document.querySelector<HTMLTextAreaElement>('[data-testid="historical-body"]');
  if (!editor) throw new Error("历史全文未挂载");
  await act(async () => {
    editor.focus();
    editor.setSelectionRange(1, 5);
  });
  const reads = [...native.preview.mock.calls],
    lists = [...native.list.mock.calls],
    queries = [...client.getQueryCache().getAll()];
  const detail = current().history.preview;
  for (const next of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(next));
    expect(document.querySelector('[data-testid="historical-body"]')).toBe(editor);
    expect(document.activeElement).toBe(editor);
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([1, 5]);
    expect(native.mounts).toBe(1);
    expect(current().history.filterActor).toBe("old-author");
    expect(current().history.selected).toBe(1);
    expect(current().history.preview).toBe(detail);
    expect(client.getQueryCache().getAll()).toEqual(queries);
    expect(native.preview.mock.calls).toEqual(reads);
    expect(native.list.mock.calls).toEqual(lists);
    expect(native.apply).not.toHaveBeenCalled();
    expect(detail?.value.content).toBe(body);
    expect(detail?.entry.source).toBe("用户原始原因");
  }
});
it("恢复确认与失败重试换语保持原操作身份和预览修订，不提前恢复", async () => {
  await mount();
  const failure = Object.assign(new Error("原始冲突诊断"), { code: "CONTENT_VERSION_CONFLICT" });
  native.apply.mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
  await act(async () => button("restore").click());
  const action = current().history.confirming;
  if (!action) throw new Error("恢复操作未准备");
  const reads = [...native.preview.mock.calls];
  for (const next of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(next));
    expect(current().history.confirming).toBe(action);
    expect(native.apply).not.toHaveBeenCalled();
    expect(native.preview.mock.calls).toEqual(reads);
  }
  await act(async () => button("confirm.restore").click());
  await settle();
  expect(current().history.error?.cause).toBe(failure);
  expect(current().history.confirming).toBe(action);
  await act(async () => desktopLocaleSource.setLocale("zh-TW"));
  expect(native.apply).toHaveBeenCalledTimes(1);
  await act(async () => button("confirm.restore").click());
  await settle();
  const expected = { ...action, expectedRevision: "a".repeat(64) };
  expect(native.apply.mock.calls).toEqual([
    ["document-raw", expected],
    ["document-raw", expected],
  ]);
  expect(failure.message).toBe("原始冲突诊断");
});
