import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SharedWhiteboardInfo } from "@tau/collaboration";
import { ShareLocalDialog } from "../components/ShareLocalDialog";

const mocks = vi.hoisted(() => ({
  candidates: vi.fn(),
  share: vi.fn(),
  search: vi.fn(),
}));
vi.mock("@/commands", () => ({
  createSharedContent: vi.fn(),
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
beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const render = (whiteboards: SharedWhiteboardInfo[]) =>
  root.render(
    <QueryClientProvider client={new QueryClient()}>
      <ShareLocalDialog
        open
        onOpenChange={() => {}}
        sessions={[]}
        whiteboards={whiteboards}
        onShared={() => {}}
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

  await act(async () => pickWhiteboards());
  await vi.waitFor(() => expect(document.body.textContent).toContain("白板 · 2 页"));
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
  await act(async () => pickWhiteboards());
  await vi.waitFor(() => expect(button("产品路线图")).toBeTruthy());
  await act(async () => button("产品路线图").click());
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    "协作服务拒绝了这次操作，白板内容完好保存在本机。"
  );
  expect(button("产品路线图")).toBeTruthy();
});
