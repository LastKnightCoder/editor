import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DocumentHistoryEntry, DocumentHistoryPreview } from "@tau/collaboration";
import { ContentHistorySheet } from "../ContentHistorySheet";
import type { HistoryApi } from "../core/document-history";
import { useHistoryI18n } from "../history.i18n";
import { mobileLocaleSource } from "../../../services/i18n";
const viewer = vi.hoisted(() => ({ mounts: 0 }));
vi.mock("../../../services/editorKit", () => {
  const kit = {};
  return { useMobileContentKit: () => kit };
});
vi.mock("@tau/editor", () => ({
  Editor: ({ initValue }: { initValue: unknown[] }) => {
    useEffect(() => {
      viewer.mounts++;
    }, []);
    return (
      <textarea readOnly data-testid="historical-body" defaultValue={JSON.stringify(initValue)} />
    );
  },
}));
const entry = (sequence: number): DocumentHistoryEntry => ({
  sequence,
  operationId: `history-op-${sequence}`,
  actorId: "author-raw",
  actorName: "用户原作者",
  time: 1700000000000 + sequence,
  kind: "edit",
  source: "用户原始原因",
});
const rows = [entry(2), entry(1)];
const content = [
  {
    type: "paragraph",
    collabId: "block-raw",
    children: [{ collabId: "text-raw", text: "用户历史正文原文" }],
  },
];
function detail(sequence: number, compare = false): DocumentHistoryPreview {
  return {
    entry: rows.find(row => row.sequence === sequence) ?? rows[0],
    value: { title: "用户历史标题", bannerBg: "raw-banner", bannerPosition: "0.5", content },
    contracts: {},
    previousTitle: "用户旧题",
    changes: [],
    headRevision: (compare ? "b" : "a").repeat(64),
    canRestore: true,
    canUndo: true,
  };
}
let root: Root, host: HTMLDivElement, originalLocale: string;
let words: ReturnType<typeof useHistoryI18n> | undefined;
const native = { list: vi.fn(), preview: vi.fn(), apply: vi.fn() };
const api: HistoryApi = { list: native.list, preview: native.preview, apply: native.apply };
const close = vi.fn();
function Probe() {
  words = useHistoryI18n();
  return <ContentHistorySheet api={api} onClose={close} />;
}
function label(key: "fullText" | "restore" | "confirm.restore") {
  if (!words) throw new Error("历史界面未挂载");
  return words.t(key);
}
function button(key: "fullText" | "restore" | "confirm.restore") {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    item => item.textContent?.trim() === label(key)
  );
  if (!found) throw new Error("历史动作未挂载");
  return found;
}
beforeEach(() => {
  vi.clearAllMocks();
  viewer.mounts = 0;
  words = undefined;
  native.list.mockReset().mockResolvedValue(rows);
  native.preview
    .mockReset()
    .mockImplementation(async (sequence, compare) => detail(sequence, compare));
  native.apply.mockReset();
  originalLocale = mobileLocaleSource.getSnapshot();
  mobileLocaleSource.setLocale("zh-CN");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  mobileLocaleSource.setLocale(originalLocale);
  vi.restoreAllMocks();
});
async function mount() {
  await act(async () => root.render(<Probe />));
}
it("历史全文与选中版本跨语言保留，既有正文不重读或重建", async () => {
  await mount();
  const select = document.querySelector<HTMLSelectElement>("select");
  if (!select) throw new Error("版本选择未挂载");
  await act(async () => {
    select.value = "1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => button("fullText").click());
  const editor = document.querySelector<HTMLTextAreaElement>('[data-testid="historical-body"]');
  if (!editor) throw new Error("历史全文未挂载");
  await act(async () => {
    editor.focus();
    editor.setSelectionRange(1, 6);
  });
  const reads = [...native.preview.mock.calls];
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(document.querySelector("select")).toBe(select);
    expect(select.value).toBe("1");
    expect(document.querySelector('[data-testid="historical-body"]')).toBe(editor);
    expect(viewer.mounts).toBe(1);
    expect(document.activeElement).toBe(editor);
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([1, 6]);
    expect(native.list).toHaveBeenCalledTimes(1);
    expect(native.preview.mock.calls).toEqual(reads);
    expect(native.apply).not.toHaveBeenCalled();
    expect(rows[1].actorName).toBe("用户原作者");
    expect(rows[1].source).toBe("用户原始原因");
  }
});
it("恢复比较与在途确认换语不重发，失败重试保留操作ID并使用原比较修订", async () => {
  await mount();
  let reject: ((failure: Error) => void) | undefined;
  native.apply.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  const allocation = vi.spyOn(crypto, "randomUUID");
  await act(async () => button("restore").click());
  expect(native.preview.mock.calls).toEqual([
    [2, false],
    [2, true],
  ]);
  const allocated = allocation.mock.calls.length;
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(native.preview.mock.calls).toEqual([
      [2, false],
      [2, true],
    ]);
    expect(allocation.mock.calls.length).toBe(allocated);
    expect(native.apply).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  }
  await act(async () => button("confirm.restore").click());
  const action = native.apply.mock.calls[0][0];
  expect(action).toMatchObject({ kind: "restore", sequence: 2, expectedRevision: "b".repeat(64) });
  await act(async () => mobileLocaleSource.setLocale("zh-TW"));
  expect(native.apply).toHaveBeenCalledTimes(1);
  expect(native.preview).toHaveBeenCalledTimes(2);
  const failure = Object.assign(new Error("协作文档已失效"), {
    code: "UI_HISTORY_DOCUMENT_UNAVAILABLE",
  });
  if (!reject) throw new Error("恢复请求未启动");
  await act(async () => reject?.(failure));
  const alert = document.querySelector('[role="alert"]');
  expect(alert).not.toBeNull();
  await act(async () => mobileLocaleSource.setLocale("en-US"));
  expect(document.querySelector('[role="alert"]')).toBe(alert);
  expect(native.apply).toHaveBeenCalledTimes(1);
  expect(failure.message).toBe("协作文档已失效");
  const unknown = new Error("服务器原始诊断: trace-42");
  native.apply.mockRejectedValueOnce(unknown);
  await act(async () => button("confirm.restore").click());
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(unknown.message);
  await act(async () => mobileLocaleSource.setLocale("zh-TW"));
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(unknown.message);
  native.apply.mockResolvedValueOnce(undefined);
  await act(async () => button("confirm.restore").click());
  expect(native.apply.mock.calls).toEqual([[action], [action], [action]]);
  expect(close).toHaveBeenCalledTimes(1);
  expect(native.preview).toHaveBeenCalledTimes(2);
});
