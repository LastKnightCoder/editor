import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SharedWhiteboardInfo } from "@tau/collaboration";
import type { SearchResult } from "@/types";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { sharingTranslator } from "../sharing.i18n";
import useSettingStore from "@/stores/useSettingStore";
import { ShareLocalDialog } from "../components/ShareLocalDialog";

const mocks = vi.hoisted(() => ({
  candidates: vi.fn(),
  share: vi.fn(),
  search: vi.fn(),
  create: vi.fn(),
  close: vi.fn(),
  shared: vi.fn(),
}));
vi.mock("@/commands", () => ({
  createSharedContent: mocks.create,
  searchHybridContent: mocks.search,
}));
vi.mock("@/commands/whiteboard-document", () => ({
  searchWhiteboardShareCandidates: mocks.candidates,
}));
vi.mock("@/services/whiteboard-documents/share", () => ({
  shareWhiteboardCandidate: mocks.share,
}));
vi.mock("@/components/CollaborationUI", () => ({
  InvitationCode: ({ session }: { session: { id: string; title: string } }) => (
    <p data-testid="invitation">{`${session.id}:${session.title}`}</p>
  ),
}));

const candidate = {
  boardId: 3,
  title: "产品路线图",
  documentId: "doc",
  contentId: 30,
  pages: 2,
};
const room: SharedWhiteboardInfo = {
  id: "room",
  title: "产品路线图",
  ownerId: "me",
  role: "owner",
  status: "active",
  members: [],
  updatedAt: 0,
  serverUrl: "https://collab.test",
};

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  client.clear();
  vi.useRealTimers();
});

const render = (whiteboards: SharedWhiteboardInfo[]) =>
  root.render(
    <QueryClientProvider client={client}>
      <ShareLocalDialog
        open
        onOpenChange={mocks.close}
        sessions={[]}
        whiteboards={whiteboards}
        onShared={mocks.shared}
      />
    </QueryClientProvider>
  );
const pickWhiteboards = () =>
  document.querySelector<HTMLInputElement>('input[type="radio"][value="whiteboard"]')!.click();
const button = (text: string) =>
  [...document.querySelectorAll("button")].find(item => item.textContent?.includes(text))!;

it("选「白板」不输关键词即列出可共享的白板，点选后共享并展示协作码", async () => {
  mocks.candidates.mockResolvedValue([candidate]);
  mocks.share.mockResolvedValue({ documentId: "room", serverUrl: "https://collab.test" });
  await act(async () => render([]));
  expect(mocks.candidates).not.toHaveBeenCalled();

  await act(async () => {
    pickWhiteboards();
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(button(candidate.title)).toBeInstanceOf(HTMLButtonElement);
  expect(mocks.search).not.toHaveBeenCalled();

  await act(async () => button("产品路线图").click());
  expect(mocks.share).toHaveBeenCalledWith(expect.any(String), candidate);
  // 共享完成后房间经协作状态推送进来，才展示协作码
  await act(async () => render([room]));
  expect(document.querySelector('[data-testid="invitation"]')?.textContent).toBe("room:产品路线图");
});

it("白板共享失败时原位显示原因，回到选择", async () => {
  mocks.candidates.mockResolvedValue([candidate]);
  mocks.share.mockRejectedValue(new Error("FORBIDDEN: denied"));
  await act(async () => render([]));
  await act(async () => {
    pickWhiteboards();
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(button(candidate.title)).toBeInstanceOf(HTMLButtonElement);
  await act(async () => button("产品路线图").click());
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  expect(button("产品路线图")).toBeInstanceOf(HTMLButtonElement);
  expect(mocks.share).toHaveBeenCalledExactlyOnceWith(expect.any(String), candidate);
});

function inputQuery(value: string) {
  const input = document.querySelector<HTMLInputElement>("input[placeholder]");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!input || !setter) throw new Error("共享检索输入未挂载");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return input;
}

it("共享中与失败后换语保留查询、过滤和草稿，不重复共享；完成只回传原房间ID", async () => {
  vi.useFakeTimers();
  const original = desktopLocaleSource.getSnapshot();
  let reject: ((cause: Error) => void) | undefined;
  mocks.candidates.mockResolvedValue([candidate]);
  mocks.share.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  try {
    await act(async () => {
      desktopLocaleSource.setLocale("zh-CN");
      render([]);
    });
    await act(async () => {
      pickWhiteboards();
      await vi.advanceTimersByTimeAsync(1);
    });
    let input: HTMLInputElement | undefined;
    await act(async () => {
      input = inputQuery("产品检索草稿");
      await vi.advanceTimersByTimeAsync(251);
    });
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(mocks.candidates).toHaveBeenLastCalledWith(
      useSettingStore.getState().setting.database.active,
      "产品检索草稿"
    );
    if (!input) throw new Error("共享检索草稿未挂载");
    await act(async () => {
      input?.focus();
      input?.setSelectionRange(1, 4);
    });
    const filter = document.querySelector<HTMLInputElement>(
      'input[type="radio"][value="whiteboard"]'
    );
    const queries = [...client.getQueryCache().getAll()];
    const reads = [...mocks.candidates.mock.calls];
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => {
        desktopLocaleSource.setLocale(locale);
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(document.querySelector("input[placeholder]")).toBe(input);
      expect(input.value).toBe("产品检索草稿");
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
      expect(filter?.checked).toBe(true);
      expect(client.getQueryCache().getAll()).toEqual(queries);
      expect(mocks.candidates.mock.calls).toEqual(reads);
      expect(mocks.share).not.toHaveBeenCalled();
    }
    await act(async () => button(candidate.title).click());
    for (const locale of ["zh-TW", "zh-CN"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(mocks.share).toHaveBeenCalledExactlyOnceWith(
        useSettingStore.getState().setting.database.active,
        candidate
      );
      expect(mocks.close).not.toHaveBeenCalled();
      expect(mocks.shared).not.toHaveBeenCalled();
    }
    const failure = new Error("FORBIDDEN: raw-rejection-trace");
    if (!reject) throw new Error("白板共享未启动");
    await act(async () => reject?.(failure));
    const alert = document.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.querySelector<HTMLInputElement>("input[placeholder]")?.value).toBe(
        "产品检索草稿"
      );
      expect(
        document.querySelector<HTMLInputElement>('input[type="radio"][value="whiteboard"]')?.checked
      ).toBe(true);
      expect(document.querySelector('[role="alert"]')).toBe(alert);
      expect(client.getQueryCache().getAll()).toEqual(queries);
      expect(mocks.candidates.mock.calls).toEqual(reads);
      expect(mocks.share).toHaveBeenCalledTimes(1);
      expect(failure.message).toBe("FORBIDDEN: raw-rejection-trace");
    }
    const unknown = new Error("自定义共享诊断: raw-trace-43");
    mocks.share.mockRejectedValueOnce(unknown);
    await act(async () => button(candidate.title).click());
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(unknown.message);
    await act(async () => desktopLocaleSource.setLocale("zh-TW"));
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(unknown.message);
    expect(mocks.share).toHaveBeenCalledTimes(2);
    mocks.share.mockResolvedValueOnce({ documentId: room.id, serverUrl: room.serverUrl });
    await act(async () => {
      button(candidate.title).click();
    });
    await act(async () => render([room]));
    await act(async () => desktopLocaleSource.setLocale("zh-TW"));
    expect(document.querySelector('[data-testid="invitation"]')?.textContent).toBe(
      `${room.id}:${room.title}`
    );
    expect(mocks.shared).not.toHaveBeenCalled();
    await act(async () => button(sharingTranslator.t("share.done")).click());
    expect(mocks.shared).toHaveBeenCalledExactlyOnceWith(room.id);
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(false);
    expect(mocks.share).toHaveBeenCalledTimes(3);
  } finally {
    await act(async () => desktopLocaleSource.setLocale(original));
  }
});

it.each([
  { type: "article", title: "文章 #1001" },
  { type: "card", title: undefined },
] as const)("界面为英文时，$type共享仍使用原默认标题协议", async ({ type, title }) => {
  vi.useFakeTimers();
  const original = desktopLocaleSource.getSnapshot();
  const item: SearchResult = {
    id: 101,
    contentId: 1001,
    type,
    title: "",
    content: [],
    source: "fts",
    updateTime: 0,
  };
  mocks.search.mockResolvedValue([item]);
  mocks.candidates.mockResolvedValue([]);
  mocks.create.mockResolvedValue({ documentId: "content-room-raw" });
  try {
    await act(async () => {
      desktopLocaleSource.setLocale("en-US");
      render([]);
    });
    await act(async () => {
      inputQuery("query raw");
      await vi.advanceTimersByTimeAsync(251);
    });
    await act(async () => vi.advanceTimersByTimeAsync(1));
    const result = document.querySelector<HTMLButtonElement>("li button");
    if (!result) throw new Error("本机内容候选未挂载");
    await act(async () => result.click());
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(1001, type, 101, title);
    expect(item.title).toBe("");
    expect(item.content).toEqual([]);
  } finally {
    await act(async () => desktopLocaleSource.setLocale(original));
  }
});
