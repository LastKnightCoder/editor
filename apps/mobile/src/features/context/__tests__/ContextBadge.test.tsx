// 脉络入口的渲染条件：加载中显示骨架；关联数为 0 或查询失败时不渲染（对齐桌面 KL-015）；
// 有关联时显示「脉络 · N」入口。tauri 命令经 vi.mock 打桩。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { EntityContext } from "../types";
import { ContextBadge } from "../ContextBadge";

const entityContextGet = vi.fn();
const entityContextResolveEntities = vi.fn();

vi.mock("../../../services/tauri", () => ({
  entityContextGet: (...args: unknown[]) => entityContextGet(...args),
  entityContextResolveEntities: (...args: unknown[]) => entityContextResolveEntities(...args),
}));

function contextOf(links: number, overrides: Partial<EntityContext> = {}): EntityContext {
  return {
    selfEntity: { kind: "card", id: 1, contentId: 10, title: "自身", meta: "", diary: null },
    selfContentIds: [10],
    links: Array.from({ length: links }, (_, index) => ({
      entity: {
        kind: "card" as const,
        id: index + 2,
        contentId: 0,
        title: `卡片${index}`,
        meta: "",
        diary: null,
      },
      inlineOnly: false,
    })),
    projections: [],
    backlinks: [],
    backlinkTotal: 0,
    questions: [],
    pluginLinks: [],
    sources: [],
    derived: [],
    notebookProjections: [],
    usages: [],
    aiMeta: null,
    inlineSources: [],
    ...overrides,
  };
}

async function render(node: ReactNode): Promise<() => Promise<void>> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  };
}

describe("ContextBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entityContextResolveEntities.mockResolvedValue([]);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("关联数为 0 时不渲染入口", async () => {
    entityContextGet.mockResolvedValue(contextOf(0));
    const cleanup = await render(<ContextBadge kind="card" id={1} />);
    expect(document.body.textContent).not.toContain("脉络");
    await cleanup();
  });

  it("查询失败时不渲染入口", async () => {
    entityContextGet.mockRejectedValue(new Error("db error"));
    const cleanup = await render(<ContextBadge kind="card" id={1} />);
    expect(document.body.textContent).not.toContain("脉络");
    await cleanup();
  });

  it("有关联时显示「脉络 · N」并按分区合计计数", async () => {
    entityContextGet.mockResolvedValue(
      contextOf(2, { backlinkTotal: 3, questions: [{ id: 1, title: "q", status: "not_started" }] })
    );
    const cleanup = await render(<ContextBadge kind="card" id={1} />);
    expect(document.body.textContent).toContain("脉络 · 6");
    await cleanup();
  });
});
