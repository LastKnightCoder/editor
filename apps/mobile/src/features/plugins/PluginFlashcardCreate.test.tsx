import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { PluginContext, PluginFlashcardDraft } from "@tau/plugins";
import { createMobileFlashcards } from "../../app/plugins/flashcards";
import type { MobileDataAdapter } from "../../app/plugins/data";
import { PluginFlashcardCreate } from "./PluginFlashcardCreate";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../services/editorMarkdown", () => ({
  mobileImportFromMarkdown: async (text: string) => [
    { type: "paragraph", children: [{ type: "formatted", text }] },
  ],
}));
vi.mock("../../app/plugins/context", () => ({ useMobilePlugins: () => ({ flashcards: service }) }));
vi.mock("../../router", () => ({
  usePage: () => ({ params: { requestId: requestId }, entryId: "create", navigator }),
  usePageLifecycle: () => undefined,
}));
vi.mock("./PluginPageView", () => ({
  PluginPageShell: (props: { children: import("react").ReactNode }) => <div>{props.children}</div>,
}));
vi.mock("../flashcard/CardCreatePage", () => ({
  CardCreatePage: (props: { onChoose(id: number, type: string): void; onBack(): void }) => (
    <>
      <button onClick={() => props.onChoose(1, "qa")}>问答题</button>
      <button onClick={props.onBack}>取消</button>
    </>
  ),
}));
vi.mock("../flashcard/CardEditPage", () => ({
  CardEditPage: (props: {
    initialPrompt: unknown;
    createCard(input: unknown): Promise<void>;
    onSaved(): void;
    onBack(): void;
  }) => (
    <>
      <div>{JSON.stringify(props.initialPrompt)}</div>
      <button
        onClick={async () => {
          await props.createCard(draft);
          props.onSaved();
        }}
      >
        保存
      </button>
      <button onClick={props.onBack}>取消</button>
    </>
  ),
}));
const navigator = { getActiveScreen: () => ({ id: "create" }), goBackBypassed: vi.fn() };
const draft: PluginFlashcardDraft & { deckId: number } = {
  deckId: 1,
  type: "qa",
  prompt: [{ type: "paragraph", children: [{ type: "formatted", text: "题干" }] }],
  data: { answer: "答案" },
};
let service: ReturnType<typeof createMobileFlashcards>;
let requestId = 0;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  service?.dispose();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function mount() {
  vi.stubGlobal("navigator", { userActivation: { isActive: true } });
  const context = {
    pluginId: "test",
    workspaceId: "one.db",
    signal: new AbortController().signal,
  } as PluginContext;
  service = createMobileFlashcards(
    "one.db",
    "token",
    {} as MobileDataAdapter,
    {
      push: (_key, params) => {
        requestId = params?.requestId as number;
      },
    },
    vi.fn()
  );
  const result = service.adapter.openCreate(context, { content: "预填题干", references: [] });
  const container = document.createElement("div");
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cleanups.push(async () => {
    await act(async () => root.unmount());
    client.clear();
  });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <PluginFlashcardCreate />
      </QueryClientProvider>
    )
  );
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  const click = async (text: string) =>
    act(async () =>
      [...container.querySelectorAll("button")].find(button => button.textContent === text)?.click()
    );
  return { container, result, click };
}
it("手动题型选择进入编辑页，预填题干并回传保存结果", async () => {
  const { container, result, click } = await mount();
  await click("问答题");
  expect(container.textContent).toContain("预填题干");
  vi.mocked(invoke).mockResolvedValue({
    ...draft,
    id: 8,
    detail: [],
    tags: [],
    difficulty: "standard",
  });
  await click("保存");
  await expect(result).resolves.toMatchObject({
    status: "completed",
    cards: [{ id: 8, deckId: 1 }],
  });
  expect(navigator.goBackBypassed).toHaveBeenCalledWith("ui");
});
it("取消题型选择不落库", async () => {
  const { result, click } = await mount();
  await click("取消");
  await expect(result).resolves.toEqual({ status: "cancelled", cards: [] });
  expect(invoke).not.toHaveBeenCalled();
});
it("会话结束使编辑页移除并拒绝后续保存", async () => {
  const { container, result, click } = await mount();
  await click("问答题");
  await act(async () => service.dispose());
  expect(container.textContent).toContain("建卡请求已结束");
  expect(
    [...container.querySelectorAll("button")].some(button => button.textContent === "保存")
  ).toBe(false);
  await expect(result).resolves.toEqual({ status: "cancelled", cards: [] });
});
