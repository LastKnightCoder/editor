// 图集设置正文：数字框失焦钳位、链接入口经 Menu 打开输入行，设置协议（ISetting）保持不变。
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import ImageGallerySetting, { type ISetting } from "..";
import { EGalleryMode } from "../../../../../types";

vi.mock("../../../../../hooks/useUploadResource", () => ({ default: () => undefined }));
vi.mock("../../../../../services/hooks", () => ({ useEditorSlots: () => ({}) }));
vi.mock("@tau/editor/api", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/editor/api")>()),
  useOptionalService: () => undefined,
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = "";
});

const mount = async (initial: ISetting) => {
  const changes: ISetting[] = [];
  const Host = () => {
    const [setting, setSetting] = useState(initial);
    return (
      <ImageGallerySetting
        setting={setting}
        onSettingChange={next => {
          changes.push(next);
          setSetting(next);
        }}
      />
    );
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <DndProvider backend={HTML5Backend}>
        <Host />
      </DndProvider>
    );
  });
  return changes;
};

const fieldByLabel = (text: string) => {
  const label = [...document.querySelectorAll("label")].find(el => el.textContent === text);
  return document.getElementById(label?.htmlFor ?? "") as HTMLInputElement;
};

const typeInto = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const blur = (input: HTMLInputElement) => act(async () => input.blur());

const horizontal = (height: number): ISetting => ({
  mode: EGalleryMode.Horizontal,
  height,
  margins: 8,
  images: [],
});

describe("ImageGallerySetting", () => {
  it("图片高度低于下限时失焦钳到最小值", async () => {
    const changes = await mount(horizontal(200));
    const input = fieldByLabel("图片高度");
    await typeInto(input, "50");
    expect(changes).toHaveLength(0);
    await blur(input);
    expect(changes.at(-1)?.height).toBe(100);
    expect(input.value).toBe("100");
  });

  it("钳位结果与当前值相同时回显合法值", async () => {
    const changes = await mount(horizontal(400));
    await typeInto(fieldByLabel("图片高度"), "999");
    await blur(fieldByLabel("图片高度"));
    expect(changes).toHaveLength(0);
    expect(fieldByLabel("图片高度").value).toBe("400");
  });

  it("区间内的值随输入上报", async () => {
    const changes = await mount(horizontal(200));
    await typeInto(fieldByLabel("图片间距"), "16");
    expect(changes.at(-1)?.margins).toBe(16);
  });

  it("从菜单打开链接输入行并回车添加图片", async () => {
    const changes = await mount(horizontal(200));
    const trigger = [...document.querySelectorAll("button")].find(el =>
      el.textContent?.includes("添加图片")
    ) as HTMLButtonElement;
    await act(async () => trigger.click());
    const linkItem = [...document.querySelectorAll('[role="menuitem"]')].find(
      el => el.textContent === "输入链接"
    ) as HTMLElement;
    await act(async () => linkItem.click());

    const input = document.querySelector('input[type="url"]') as HTMLInputElement;
    await typeInto(input, "https://example.com/a.png");
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(changes.at(-1)?.images.map(image => image.url)).toEqual(["https://example.com/a.png"]);
    expect(document.querySelector('input[type="url"]')).toBeNull();
  });
});
