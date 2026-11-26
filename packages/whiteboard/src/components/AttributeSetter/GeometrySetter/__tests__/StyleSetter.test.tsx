/**
 * @vitest-environment jsdom
 */
import { createI18nRuntime, createLocaleStore, type I18nRuntime } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { attributeMessages } from "../../../../attributes-i18n";
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { customColorOption, inferMode, mixWithWhite, StyleSetter } from "../setters/StyleSetter";
import type { GeometryElement } from "../../../../plugins";

describe("inferMode", () => {
  it("fill 透明（transparent / none / 空）→ 线框", () => {
    expect(inferMode({ fill: "transparent", stroke: "#FF6A63" })).toBe("outline");
    expect(inferMode({ fill: "none", stroke: "#FF6A63" })).toBe("outline");
    expect(inferMode({ fill: undefined, stroke: "#FF6A63" })).toBe("outline");
  });

  it("fill 实色且 stroke 透明 → 实心", () => {
    expect(inferMode({ fill: "#FF6A63", stroke: "transparent" })).toBe("solid");
  });

  it("fill 实色 + 描边（含 stroke 缺省）→ 浅底", () => {
    expect(inferMode({ fill: "#B8D9FF", stroke: "#3F71FB" })).toBe("soft");
    expect(inferMode({ fill: "#B8D9FF", stroke: undefined })).toBe("soft");
  });
});

describe("mixWithWhite", () => {
  it("按白色占比混合，输出小写 #rrggbb", () => {
    expect(mixWithWhite("#3F71FB", 0.8)).toBe("#d9e3fe");
    expect(mixWithWhite("#000000", 0)).toBe("#000000");
    expect(mixWithWhite("#FFFFFF", 1)).toBe("#ffffff");
    expect(mixWithWhite("#808080", 0.5)).toBe("#c0c0c0");
  });

  it("非法输入原样返回", () => {
    expect(mixWithWhite("currentColor", 0.8)).toBe("currentColor");
    expect(mixWithWhite("#FFF", 0.8)).toBe("#FFF");
  });
});

describe("customColorOption", () => {
  it("线框：基色作描边、填充透明", () => {
    expect(customColorOption("outline", "#123456")).toEqual({
      fill: "transparent",
      stroke: "#123456",
      color: "currentColor",
    });
  });

  it("实心：基色作填充、描边透明、深色主题文字", () => {
    expect(customColorOption("solid", "#123456")).toEqual({
      fill: "#123456",
      stroke: "transparent",
      color: "#fff",
      theme: "dark",
    });
  });

  it("浅底：基色作描边、填充为 80% 白混色、浅色主题文字", () => {
    expect(customColorOption("soft", "#123456")).toEqual({
      fill: "#d0d6dd",
      stroke: "#123456",
      color: "#000",
      theme: "light",
    });
  });
});

/* ───────── 组件行为 ───────── */

const roots: Root[] = [];
const runtimes: I18nRuntime[] = [];

function makeElement(overrides: Partial<GeometryElement> = {}): GeometryElement {
  return {
    id: "el-1",
    type: "geometry",
    geometryType: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    paths: [],
    text: { align: "center", content: [] },
    ...overrides,
  };
}

/** 受控宿主：onChange 记录新 element 并回写，贴近属性条真实用法 */
function mountSetter(initial: GeometryElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  let current = initial;
  const received: GeometryElement[] = [];
  const Component = new StyleSetter().getComponent();
  function Harness() {
    return (
      <Component
        element={current}
        onChange={next => {
          received.push(next);
          current = next;
        }}
      />
    );
  }
  void act(() => {
    root.render(<Harness />);
  });
  return { received };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const runtime of runtimes.splice(0)) runtime.dispose();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("StyleSetter 组件", () => {
  it("浅底蓝色切「实心」→ 应用实心组同色相（蓝色下标 4）", () => {
    const { received } = mountSetter(
      makeElement({ fill: "#B8D9FF", stroke: "#3F71FB", color: "#000", theme: "light" })
    );
    void act(() => {
      (document.querySelector('button[aria-label="样式"]') as HTMLElement).click();
    });
    const solidRadio = document.querySelector<HTMLInputElement>('input[value="solid"]');
    expect(solidRadio).not.toBeNull();
    void act(() => {
      solidRadio?.click();
    });
    expect(received).toHaveLength(1);
    expect(received[0].fill).toBe("#3F71FB");
    expect(received[0].stroke).toBe("transparent");
    expect(received[0].theme).toBe("dark");
  });

  it("矩形显示圆角档位", () => {
    mountSetter(makeElement({ fill: "#B8D9FF", stroke: "#3F71FB" }));
    void act(() => {
      (document.querySelector('button[aria-label="样式"]') as HTMLElement).click();
    });
    expect(document.querySelector('button[aria-label="小"]')).not.toBeNull();
  });

  it("非矩形不显示圆角档位", () => {
    mountSetter(makeElement({ geometryType: "ellipse", fill: "#B8D9FF", stroke: "#3F71FB" }));
    void act(() => {
      (document.querySelector('button[aria-label="样式"]') as HTMLElement).click();
    });
    expect(document.querySelector('button[aria-label="小"]')).toBeNull();
  });

  it.each([
    ["浅底", { fill: "#FFD0CE", stroke: "#FF6A63" }],
    ["实心", { fill: "#FF6A63", stroke: "transparent" }],
    ["线框", { fill: "transparent", stroke: "#FF6A63" }],
  ])("%s组选红色时只高亮一个色块（红 / 粉不同值）", (_, colors) => {
    mountSetter(makeElement(colors));
    void act(() => {
      (document.querySelector('button[aria-label="样式"]') as HTMLElement).click();
    });
    const pressed = document.querySelectorAll('button.rounded-full[aria-pressed="true"]');
    expect(pressed).toHaveLength(1);
  });
});

it("样式面板换语保留精确输入草稿和选区，不重复写入元素属性", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  runtimes.push(runtime);
  const { t } = runtime.get(attributeMessages);
  const initial = makeElement({
    fill: "#B8D9FF",
    stroke: "#3F71FB",
    strokeWidth: 2,
    extraInfo: { cornerRadius: 8 },
  });
  const Component = new StyleSetter().getComponent();
  const received: GeometryElement[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  function Harness() {
    const [element, setElement] = useState(initial);
    return (
      <Component
        element={element}
        onChange={next => {
          received.push(next);
          setElement(next);
        }}
      />
    );
  }
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={runtime}>
        <Harness />
      </I18nRuntimeProvider>
    )
  );
  const open = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${t("attributes.style")}"]`
  );
  if (!open) throw new Error("样式面板未挂载");
  await act(async () => open.click());
  await act(async () => vi.advanceTimersToNextFrame());
  const input = document.querySelector<HTMLInputElement>(
    `input[aria-label="${t("attributes.width")}"]`
  );
  if (!input) throw new Error("精确输入未挂载");
  await act(async () => {
    input.focus();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) throw new Error("原生输入 setter 不存在");
    setValue.call(input, "3.");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(received.map(element => element.strokeWidth)).toEqual([3]);
  input.setSelectionRange(0, 2);
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => source.setLocale(locale));
    expect(document.querySelector(`input[aria-label="${t("attributes.width")}"]`)).toBe(input);
    expect(input.value).toBe("3.");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2]);
    expect(received.map(element => element.strokeWidth)).toEqual([3]);
    expect(received[0]).toMatchObject({
      fill: initial.fill,
      stroke: initial.stroke,
      extraInfo: initial.extraInfo,
    });
  }
  const plus = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${t("attributes.increase", { label: t("attributes.width") })}"]`
  );
  if (!plus) throw new Error("步进按钮未挂载");
  await act(async () => plus.focus());
  expect(received.map(element => element.strokeWidth)).toEqual([3]);
  await act(async () => plus.click());
  expect(received.map(element => element.strokeWidth)).toEqual([3, 4]);
  expect(initial.strokeWidth).toBe(2);
});
