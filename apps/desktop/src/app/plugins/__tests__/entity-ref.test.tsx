import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntityRef, type PluginContext, type PluginEntityDescription } from "@tau/plugins";

vi.mock("@/components/EntityKind", () => ({
  useEntityKindMeta: (_ref: unknown, fallback: unknown) => fallback,
}));

import { PluginComponentScope } from "../content-components";
import { pickedEntity } from "../app";

function pluginContext(results: Record<string, PluginEntityDescription["status"] | string>) {
  const describe = vi.fn(async (refs: { kind: string; id: string }[]) =>
    refs.map(ref => {
      const value = results[`${ref.kind}:${ref.id}`];
      if (value === "missing") return { ref, status: "missing" };
      if (value === "denied") return { ref, status: "denied", permission: "projects:read" };
      if (value === "denied-null") return { ref, status: "denied", permission: null };
      return { ref, status: "ok", title: value };
    })
  );
  const context = {
    pluginId: "tau.questions",
    signal: new AbortController().signal,
    app: { describe, open: vi.fn(async () => undefined) },
    permissions: { request: vi.fn(async () => true), query: vi.fn() },
  } as unknown as PluginContext;
  return { context, describe };
}

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(element: React.ReactNode, context?: PluginContext) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        {context ? (
          <PluginComponentScope context={context}>{element}</PluginComponentScope>
        ) : (
          element
        )}
      </QueryClientProvider>
    )
  );
  for (let index = 0; index < 10; index++) await act(() => new Promise(r => setTimeout(r, 0)));
}

describe("插件引用组件", () => {
  it("同一轮渲染的引用合并成一次 describe，按状态显示标题、已删除与授权入口", async () => {
    const { context, describe } = pluginContext({
      "card:3": "读书笔记",
      "article:5": "missing",
      "project:2": "denied",
      "diary:8": "denied-null",
    });
    await render(
      <>
        <EntityRef target={{ kind: "card", id: "3" }} />
        <EntityRef target={{ kind: "article", id: "5" }} />
        <EntityRef target={{ kind: "project", id: "2" }} />
        <EntityRef target={{ kind: "diary", id: "8" }} openable={false} />
      </>,
      context
    );
    expect(describe).toHaveBeenCalledTimes(1);
    expect(describe.mock.calls[0][0]).toHaveLength(4);
    const text = container.textContent ?? "";
    expect(text).toContain("读书笔记");
    expect(text).toContain("已删除");
    expect(text).toContain("允许访问");
    expect(text).toContain("未获准查看");

    const card = [...container.querySelectorAll("button")].find(b =>
      b.textContent?.includes("读书笔记")
    );
    act(() => card?.click());
    expect(context.app.open).toHaveBeenCalledWith({ kind: "card", id: "3" });

    const allow = [...container.querySelectorAll("button")].find(b =>
      b.textContent?.includes("允许访问")
    );
    await act(async () => allow?.click());
    expect(context.permissions.request).toHaveBeenCalledWith(["projects:read"]);
  });

  it("插件页面之外只显示类型名", async () => {
    await render(<EntityRef target={{ kind: "card", id: "3" }} />);
    expect(container.textContent).toContain("只能在插件页面中显示");
  });
});

describe("选择器候选到插件引用", () => {
  const base = { contentId: null, title: "标题", excerpt: "", meta: "", time: 1 };
  it("材料带类型前缀，对话用会话 ID，其余为数字 ID", () => {
    expect(pickedEntity({ ...base, kind: "pdf-annotation", id: 9 })?.ref).toEqual({
      kind: "material",
      id: "pdf-annotation:9",
    });
    expect(pickedEntity({ ...base, kind: "chat-session", id: 0, sessionId: "s1" })?.ref).toEqual({
      kind: "chat-session",
      id: "s1",
    });
    expect(pickedEntity({ ...base, kind: "chat-session", id: 0 })).toBeNull();
    expect(pickedEntity({ ...base, kind: "notebook", id: 6 })?.ref).toEqual({
      kind: "notebook",
      id: "6",
    });
  });
});
