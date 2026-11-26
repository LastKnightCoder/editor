import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { editorMessages } from "../../../../i18n-runtime";
import Mermaid from "../extensions/mermaid/components/Mermaid";
import { renderMermaidSvg } from "../renderers/mermaid-render-core";
vi.mock("../renderers/mermaid-render-core", () => ({ renderMermaidSvg: vi.fn() }));
// 预览渲染器的 onError 协议：出错回调错误与「是否还留着旧结果」，并保留上一次成功的结果
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import PlantUML from "../renderers/PlantUML";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

const render = async (node: React.ReactNode) => {
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root!.render(node);
  });
  return container;
};

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});
describe("PlantUML onError", () => {
  it("新图加载失败时退回上一张成功的图并上报", async () => {
    const onError = vi.fn();
    const host = await render(<PlantUML isDark={false} content="A -> B" onError={onError} />);
    const img = () => host.querySelector("img") as HTMLImageElement;
    const firstSrc = img().getAttribute("src");
    await act(async () => {
      img().dispatchEvent(new Event("load"));
    });
    expect(onError).toHaveBeenLastCalledWith(null);

    await render(<PlantUML isDark={false} content="A -> C" onError={onError} />);
    expect(img().getAttribute("src")).not.toBe(firstSrc);
    await act(async () => {
      img().dispatchEvent(new Event("error"));
    });
    expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("PlantUML"), true);
    expect(img().getAttribute("src")).toBe(firstSrc);
  });
});

it("切换语言更新失败提示，保留上一张图且不重发图表绘制", async () => {
  const locale = createLocaleStore("zh-CN"),
    runtime = createI18nRuntime({ localeSource: locale });
  const t = runtime.get(editorMessages).t;
  vi.mocked(renderMermaidSvg).mockRejectedValue(42);
  const plantError = vi.fn();
  try {
    const host = await render(
      <I18nRuntimeProvider runtime={runtime}>
        <Mermaid chart="graph TD;A-->B" />
        <PlantUML isDark={false} content="A -> B" onError={plantError} />
      </I18nRuntimeProvider>
    );
    const image = host.querySelector("img");
    if (!image) throw new Error("图表未挂载");
    await act(async () => image.dispatchEvent(new Event("error")));
    const url = image.getAttribute("src");
    const calls = vi.mocked(renderMermaidSvg).mock.calls.length;
    for (const next of ["zh-TW", "en-US"]) {
      await act(async () => locale.setLocale(next));
      expect(host.textContent).toContain(t("code.renderFailed"));
      expect(host.querySelector("img")).toBe(image);
      expect(image.getAttribute("src")).toBe(url);
      expect(plantError).toHaveBeenLastCalledWith(t("code.plantumlFailed"), false);
      expect(vi.mocked(renderMermaidSvg).mock.calls.length).toBe(calls);
    }
  } finally {
    await act(async () => root?.unmount());
    root = null;
    runtime.dispose();
    vi.mocked(renderMermaidSvg).mockReset();
  }
});
