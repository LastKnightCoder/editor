/**
 * @vitest-environment jsdom
 */
import { createI18nRuntime, createLocaleStore, type I18nRuntime } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { attributeMessages } from "../../../../attributes-i18n";
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import HandwriteSetter from "../index";
import { getDefaultHandwriteStyle } from "../../../../utils";
import type { HandwriteElement } from "../../../../plugins/HandwritePlugin";

/* ───────── 组件行为 ───────── */

const roots: Root[] = [];
const runtimes: I18nRuntime[] = [];

function makeElement(overrides: Partial<HandwriteElement> = {}): HandwriteElement {
  return {
    id: "handwrite-1",
    type: "handwrite",
    name: "手写",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    points: [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 1, y: 1, pressure: 0.5 },
    ],
    outline: [],
    style: getDefaultHandwriteStyle(),
    ...overrides,
  };
}

/** 受控宿主：onChange 记录新 element 并回写，贴近属性条真实用法 */
function mountSetter(initial: HandwriteElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  let current = initial;
  const received: HandwriteElement[] = [];
  function Harness() {
    return (
      <HandwriteSetter
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

function clickButton(label: string) {
  void act(() => {
    (document.querySelector(`button[aria-label="${label}"]`) as HTMLElement).click();
  });
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const runtime of runtimes.splice(0)) runtime.dispose();
  document.body.replaceChildren();
});

describe("HandwriteSetter 组件", () => {
  it("样式弹层选不透明度「50%」档 → 写入 opacity 0.5", () => {
    const { received } = mountSetter(makeElement());
    clickButton("样式");
    clickButton("50%");
    expect(received).toHaveLength(1);
    expect(received[0].style.opacity).toBe(0.5);
  });

  it("不透明度 Stepper 从 50% 步进 +5 → 写入 opacity 0.55", () => {
    const { received } = mountSetter(
      makeElement({ style: { ...getDefaultHandwriteStyle(), opacity: 0.5 } })
    );
    clickButton("样式");
    clickButton("增大不透明度");
    expect(received).toHaveLength(1);
    expect(received[0].style.opacity).toBe(0.55);
  });

  it("样式弹层选粗细档「粗」（16px）→ 写入 size 16", () => {
    const { received } = mountSetter(
      makeElement({ style: { ...getDefaultHandwriteStyle(), size: 2 } })
    );
    clickButton("样式");
    clickButton("粗");
    expect(received).toHaveLength(1);
    expect(received[0].style.size).toBe(16);
  });
});

it("笔刷滑杆编辑中换语保留滑杆实例与原始样式值，不额外重建笔迹", async () => {
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  runtimes.push(runtime);
  const { t } = runtime.get(attributeMessages);
  const initial = makeElement();
  const received: HandwriteElement[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  function Harness() {
    const [element, setElement] = useState(initial);
    return (
      <HandwriteSetter
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
    `button[aria-label="${t("attributes.brush")}"]`
  );
  if (!open) throw new Error("笔刷面板未挂载");
  await act(async () => open.click());
  const slider = document.querySelector<HTMLInputElement>(
    `input[aria-label="${t("attributes.thinning")}"]`
  );
  if (!slider) throw new Error("笔刷滑杆未挂载");
  const change = (value: string) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) throw new Error("原生滑杆 setter 不存在");
    setValue.call(slider, value);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  };
  await act(async () => {
    slider.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    change("0.25");
  });
  expect(received.map(element => element.style.thinning)).toEqual([0.25]);
  const points = received[0].points,
    outline = received[0].outline;
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => source.setLocale(locale));
    expect(document.querySelector(`input[aria-label="${t("attributes.thinning")}"]`)).toBe(slider);
    expect(slider.value).toBe("0.25");
    expect(received.map(element => element.style.thinning)).toEqual([0.25]);
    expect(received[0].points).toBe(points);
    expect(received[0].outline).toBe(outline);
    expect(received[0].style).toMatchObject({
      themeColorId: initial.style.themeColorId,
      opacity: initial.style.opacity,
      size: initial.style.size,
    });
  }
  await act(async () => {
    change("0.5");
    slider.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  });
  expect(received.map(element => element.style.thinning)).toEqual([0.25, 0.5]);
});
