import { mobileLocaleSource } from "../../../services/i18n";
import { RouterProvider, definePage } from "../../../router";
import { contextTranslator } from "../i18n";
// 脉络入口的渲染条件：首次加载不占位；关联数为 0 或查询失败时不渲染（对齐桌面 KL-015）；
// 有关联时显示「脉络 · N」入口。tauri 命令经 vi.mock 打桩。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { EntityContext } from "../types";
import { ContextBadge } from "../ContextBadge";

definePage({ key: "context-locale-test-root", params: {}, component: () => null });

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
    mobileLocaleSource.setLocale("zh-CN");
    vi.clearAllMocks();
    entityContextResolveEntities.mockResolvedValue([]);
  });

  afterEach(() => {
    mobileLocaleSource.setLocale("zh-CN");
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

  it("关联计数与打开中的脉络面板跨语言保留，不重复读取或替换条目", async () => {
    const context = contextOf(2, { backlinkTotal: 3 });
    entityContextGet.mockResolvedValue(context);
    const cleanup = await render(
      <RouterProvider rootKey="context-locale-test-root">
        <ContextBadge kind="card" id={1} />
      </RouterProvider>
    );
    try {
      const button = document.querySelector<HTMLButtonElement>(
        `button[aria-label="${contextTranslator.t("title", { count: 5 })}"]`
      );
      if (!button) throw new Error("context badge missing");
      await act(async () => button.click());
      const dialog = document.querySelector("[data-pan-state]");
      if (!dialog) throw new Error("context sheet missing");
      for (const locale of ["zh-TW", "en-US"] as const) {
        await act(async () => mobileLocaleSource.setLocale(locale));
        expect(
          document.querySelector(
            `button[aria-label="${contextTranslator.t("title", { count: 5 })}"]`
          )
        ).toBe(button);
        expect(document.querySelector("[data-pan-state]")).toBe(dialog);
        expect(dialog.textContent).toContain(context.links[0].entity.title);
        expect(entityContextGet).toHaveBeenCalledExactlyOnceWith("card", 1);
        expect(entityContextResolveEntities).not.toHaveBeenCalled();
      }
    } finally {
      await cleanup();
    }
  });
});
