import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  definePlugin,
  usePluginEnvironment,
  type PluginContext,
  type PluginPageHandle,
} from "../index";
import { PluginEnvironmentProvider, snapshotPluginEnvironment } from "../environment";
import { PluginHost, createMemoryStorage } from "../host";

it("环境快照不可被作者修改，静态组件读取同一环境且不依赖 activate", () => {
  const capabilities = ["pages"];
  const environment = snapshotPluginEnvironment({
    platform: "ios",
    layout: "compact",
    input: { touch: true, finePointer: false },
    capabilities,
  });
  capabilities.push("backend");
  expect(environment.capabilities).toEqual(["pages"]);
  expect(Object.isFrozen(environment.input)).toBe(true);
  function StaticBlock() {
    return createElement("span", null, usePluginEnvironment().platform);
  }
  expect(
    renderToStaticMarkup(
      createElement(PluginEnvironmentProvider, {
        value: environment,
        children: createElement(StaticBlock),
      })
    )
  ).toContain("ios");
  expect(() => renderToStaticMarkup(createElement(StaticBlock))).toThrow("未提供插件环境");
});

it("功能入口只接受本次激活的页面，重复和失效句柄被拒绝，停用回收入口", async () => {
  const disposeEntry = vi.fn();
  const registerEntry = vi.fn(() => ({ dispose: disposeEntry }));
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    navigation: { registerEntry },
    pages: {
      register: (context, definition) => ({
        id: `${context.pluginId}:${definition.id}`,
        open: async () => {},
        dispose() {},
      }),
    },
  });
  let context!: PluginContext;
  let page!: PluginPageHandle;
  let otherPage!: PluginPageHandle;
  for (const id of ["one", "two"]) {
    host.registerTrusted(
      definePlugin({
        id,
        name: id,
        version: "1.0.0",
        create: () => ({
          activate(ctx) {
            const handle = ctx.pages.register({ id: "main", title: "页面", component: () => null });
            if (id === "one") {
              context = ctx;
              page = handle;
            } else otherPage = handle;
          },
        }),
      })
    );
    await host.enable(id);
  }
  expect(context.environment.platform).toBe("unknown");
  expect(() =>
    context.navigation.registerEntry({ id: "foreign", title: "错误", page: otherPage })
  ).toThrow("本插件");
  context.navigation.registerEntry({ id: "entry", title: "入口", page });
  expect(() => context.navigation.registerEntry({ id: "entry", title: "重复", page })).toThrow(
    "重复"
  );
  expect(registerEntry).toHaveBeenCalledOnce();
  await page.dispose();
  expect(() => context.navigation.registerEntry({ id: "stale", title: "失效", page })).toThrow(
    "有效页面"
  );
  await expect(page.open()).rejects.toThrow("已注销");
  await host.disable("one");
  expect(disposeEntry).toHaveBeenCalledOnce();
  expect(() => context.navigation.registerEntry({ id: "late", title: "迟到", page })).toThrow();
  await host.dispose();
});
