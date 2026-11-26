// @vitest-environment jsdom
import { act, createElement, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  createPluginEnvironmentStore,
  PluginEnvironmentProvider,
  usePluginEnvironment,
} from "../environment";
import { PluginHost, createMemoryStorage } from "../host";
import { defineI18n, useI18n, definePlugin, type PluginContext } from "../index";

it("环境 hook 与 context 读取同一动态源，多作用域独立且卸载注销", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const source = createPluginEnvironmentStore({
    platform: "ios",
    input: { coarsePointer: true, finePointer: false },
  });
  const other = createPluginEnvironmentStore({
    platform: "desktop",
    input: { coarsePointer: false, finePointer: true },
  });
  const host = new PluginHost({
    workspaceId: "A",
    storage: createMemoryStorage(),
    environmentSource: source,
  });
  let context!: PluginContext;
  host.registerTrusted(
    definePlugin({
      id: "env",
      name: "环境",
      version: "1.0.0",
      create: () => ({
        activate(ctx) {
          context = ctx;
        },
      }),
    })
  );
  await host.enable("env");
  let renders = 0;
  function View() {
    const env = usePluginEnvironment();
    renders++;
    return createElement(
      "span",
      null,
      `${env.platform}:${env.input.coarsePointer}:${env.input.finePointer}`
    );
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        "div",
        null,
        createElement(PluginEnvironmentProvider, { source, children: createElement(View) }),
        createElement(PluginEnvironmentProvider, { source: other, children: createElement(View) })
      )
    );
  });
  const snapshot = source.getSnapshot();
  await act(async () => source.update({ input: { coarsePointer: true, finePointer: true } }));
  expect(context.environment).toBe(source.getSnapshot());
  expect(snapshot.input.finePointer).toBe(false);
  expect(container.textContent).toBe("ios:true:truedesktop:false:true");
  const count = renders;
  await act(async () => source.update({ input: { coarsePointer: true, finePointer: true } }));
  expect(renders).toBe(count);
  expect(() => source.update({ platform: "android" } as never)).toThrow("只能更新");
  await act(async () => root.unmount());
  source.update({ input: { coarsePointer: true, finePointer: false } });
  expect(renders).toBe(count);
  await host.dispose();
  vi.unstubAllGlobals();
});

it("未激活的静态组件可直接用词典，语言切换保留正在编辑的内容", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const source = createPluginEnvironmentStore({
    locale: "zh-CN",
    platform: "web",
    input: { coarsePointer: false, finePointer: true },
  });
  const messages = defineI18n({
    fallbackLocale: "zh-CN",
    resources: { "zh-CN": { title: "甲" }, "en-US": { title: "A" } },
  });
  function StaticComponent() {
    const { t } = useI18n(messages);
    const [draft, setDraft] = useState("");
    return createElement(
      "div",
      null,
      createElement("span", null, t("title")),
      createElement("input", {
        value: draft,
        onInput: (event: FormEvent<HTMLInputElement>) => setDraft(event.currentTarget.value),
      })
    );
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(PluginEnvironmentProvider, {
          source,
          children: createElement(StaticComponent),
        })
      )
    );
    const input = container.querySelector("input");
    if (!input) throw new Error("静态组件没有输入框");
    await act(async () => {
      input.value = "draft";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => source.update({ locale: "en-US" }));
    expect(container.querySelector("span")?.textContent).toBe("A");
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("draft");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
