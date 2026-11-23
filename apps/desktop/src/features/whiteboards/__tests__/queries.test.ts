import { QueryObserver } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { queryClient } from "@/queryClient";
import "../queries";

const events = vi.hoisted(() => new EventTarget());
vi.mock("@/electron", () => ({
  on: (channel: string, listener: (event: Event, payload: unknown) => void) => {
    events.addEventListener(channel, event => listener(event, (event as CustomEvent).detail));
  },
}));
vi.mock("@/commands", () => ({}));
vi.mock("@/hooks/useUploadResource", () => ({ default: vi.fn() }));
vi.mock("@/stores/useSettingStore", () => ({ default: vi.fn() }));

it("已打开的白板在页增删落库后刷新本库页签", async () => {
  vi.useFakeTimers();
  let pages = ["导图"];
  const queryKey = ["whiteboards", "detail", "读书", 1];
  const otherBoard = ["whiteboards", "detail", "工作", 1];
  queryClient.setQueryData(queryKey, pages);
  queryClient.setQueryData(otherBoard, ["周报"]);
  const observer = new QueryObserver(queryClient, { queryKey, queryFn: async () => pages });
  const release = observer.subscribe(vi.fn());
  const project = (next: string[]) => {
    pages = next;
    events.dispatchEvent(
      new CustomEvent("whiteboard-document:projected", {
        detail: { databaseName: "读书", documentId: "board" },
      })
    );
  };
  try {
    project(["导图", "日程"]);
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toEqual(["导图", "日程"]));
    project(["日程"]);
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toEqual(["日程"]));
    expect(queryClient.getQueryState(otherBoard)?.isInvalidated).toBe(false);
  } finally {
    release();
    queryClient.clear();
    vi.useRealTimers();
  }
});

it("连续修改正文后刷新对应预览，页头和其他白板的缓存保持有效", async () => {
  vi.useFakeTimers();
  const list = ["whiteboards", "list", "读书"];
  const board = ["whiteboards", "detail", "读书", 1];
  const other = ["whiteboards", "detail", "读书", 2];
  const header = ["whiteboard-content", "读书", 3];
  const share = ["whiteboard-share", "读书", "board"];
  queryClient.setQueryData(list, []);
  queryClient.setQueryData(board, { documentId: "board" });
  queryClient.setQueryData(other, { documentId: "other" });
  queryClient.setQueryData(header, { name: "第一页" });
  queryClient.setQueryData(share, { binding: null });
  const edit = () =>
    events.dispatchEvent(
      new CustomEvent("whiteboard-document:projected", {
        detail: { databaseName: "读书", documentId: "board", bodyOnly: true },
      })
    );
  try {
    edit();
    await vi.advanceTimersByTimeAsync(300);
    edit();
    await vi.advanceTimersByTimeAsync(300);
    expect(queryClient.getQueryState(board)?.isInvalidated).toBe(false);
    await vi.advanceTimersByTimeAsync(450);
    for (const key of [list, board])
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of [other, header, share])
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
  } finally {
    queryClient.clear();
    vi.useRealTimers();
  }
});
