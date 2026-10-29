import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { MobileAppActions, MobileAppActionRequest } from "../../app/plugins/app-actions";
import { PluginAppActionHost } from "./PluginAppActionHost";
vi.mock("../../components/BottomSheet", () => ({
  BottomSheet: (props: { children: ReactNode; onClose(): void }) => (
    <section>
      {props.children}
      <button onClick={props.onClose}>取消</button>
    </section>
  ),
}));
vi.mock("../../router", () => ({
  useRouterContext: () => undefined,
  useNavigator: () => navigation,
}));
vi.mock("../../services/editorKit", () => ({ useMobileContentKit: () => null }));
vi.mock("../cards/editorToolbar/useMobileEditorToolbarController", () => ({
  useMobileEditorToolbarController: () => ({}),
}));
vi.mock("../cards/editorToolbar/MobileEditorBottomToolbar", () => ({
  MobileEditorBottomToolbar: () => null,
}));
vi.mock("../collaboration/hooks/useCollaborationRuntime", () => ({
  useCollaborationRuntime: () => undefined,
}));
vi.mock("../collaboration/ShareContentSheet", () => ({
  ShareContentSheet: () => <div>已打开协作发布</div>,
}));
vi.mock("../collaboration/MemberManageSheet", () => ({
  MemberManageSheet: () => <div>已打开成员管理</div>,
}));
const navigation = {
  getTopOverlay: () => null,
  getActiveScreen: () => ({ id: "page" }),
  registerBackHandler: vi.fn(() => () => undefined),
};
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.clearAllMocks();
});
async function mount(binding: string | null) {
  const close = vi.fn();
  const request = {
    id: 1,
    plugin: { id: "test", name: "测试插件" },
    input: { action: "content.share", ref: "1:2" },
    signal: new AbortController().signal,
    check: vi.fn(),
    close,
    shareTarget: async () => ({
      own: false,
      owners: ["card"],
      binding,
      document: {
        contentId: 1,
        content: [{ type: "paragraph", children: [{ text: "待共享正文" }] }],
      },
    }),
  } as unknown as MobileAppActionRequest;
  const actions = {
    getSnapshot: () => request,
    subscribe: () => () => undefined,
  } as unknown as MobileAppActions;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(async () => root.unmount());
    client.clear();
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <PluginAppActionHost actions={actions} />
      </QueryClientProvider>
    );
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  return { container, close };
}
it("新协作须用户确认，先展示来源及正文摘要，取消可用", async () => {
  const { container, close } = await mount(null);
  expect(container.textContent).toContain("待共享正文");
  expect(container.textContent).not.toContain("已打开协作发布");
  const buttons = [...container.querySelectorAll("button")];
  await act(async () => buttons.find(button => button.textContent === "取消")?.click());
  expect(close).toHaveBeenCalledOnce();
});
it("用户确认后才打开发布面板", async () => {
  const { container } = await mount(null);
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find(button => button.textContent === "开启协作")
      ?.click()
  );
  expect(container.textContent).toContain("已打开协作发布");
});
it("已有绑定直接打开成员管理，不重复发布", async () => {
  const { container } = await mount("shared");
  expect(container.textContent).toContain("已打开成员管理");
  expect(container.textContent).not.toContain("已打开协作发布");
});
