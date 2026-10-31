import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MobilePluginRuntime } from "../../../app/plugins/runtime";
import { MobilePluginsContext } from "../../../app/plugins/context";
import { listChatSkills } from "../../../services/aiChat/chatController";
import { SkillPickerSheet } from "../SkillPickerSheet";

vi.mock("../../../services/aiChat/chatController", () => ({ listChatSkills: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let revision = 0;
const listeners = new Set<() => void>();
const runtime = {
  subscribe: () => () => undefined,
  getSnapshot: () => 0,
  aiSkills: {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => ({ revision }),
  },
} as unknown as MobilePluginRuntime;
const skill = {
  id: "notes:weekly",
  name: "周报整理",
  description: "整理本周成果",
  sourceId: "notes",
  sourceRevision: "1",
  allowedTools: [],
  disableModelInvocation: true,
};
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(button =>
    button.textContent?.includes(text)
  );
async function flushUntil(condition: () => boolean) {
  for (let count = 0; count < 100; count++) {
    if (condition()) return;
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
  }
  throw new Error("等待 Skill 目录超时");
}
function mount() {
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <MobilePluginsContext.Provider value={runtime}>
          <SkillPickerSheet
            databaseName="one.db"
            selected={[]}
            onChange={vi.fn()}
            onClose={vi.fn()}
          />
        </MobilePluginsContext.Provider>
      </QueryClientProvider>
    )
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  revision = 0;
  listeners.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  host.remove();
});

it("插件来源变化后重新读取目录，移除已停用 Skill", async () => {
  vi.mocked(listChatSkills).mockResolvedValueOnce([skill]).mockResolvedValueOnce([]);
  mount();
  await flushUntil(() => !!byText("周报整理"));
  expect(listChatSkills).toHaveBeenCalledWith("one.db", expect.any(AbortSignal));
  await act(async () => {
    revision++;
    for (const listener of listeners) listener();
  });
  await flushUntil(() => document.body.textContent?.includes("没有可用的 Skill") ?? false);
  expect(byText("周报整理")).toBeUndefined();
});

it("目录读取失败显示重试，恢复后展示真实 Skill", async () => {
  vi.mocked(listChatSkills)
    .mockRejectedValueOnce(new Error("读取失败"))
    .mockResolvedValueOnce([skill]);
  mount();
  await flushUntil(() => !!byText("重试"));
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Skill 读取失败");
  await act(async () => byText("重试")?.click());
  await flushUntil(() => !!byText("周报整理"));
  expect(document.querySelector('[role="alert"]')).toBeNull();
});
