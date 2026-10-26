import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IntegrationSection } from "../sections/IntegrationSection";

vi.mock("@/app/plugins/context", () => ({ useDesktopPlugins: () => null }));

let container: HTMLDivElement;
let root: Root;
const text = () => document.body.textContent ?? "";

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("账号与连接只汇总视频来源，配置归插件页", () => {
  act(() => root.render(<IntegrationSection />));
  expect(text()).toContain("在线视频");
  expect(text()).toContain("对应插件页登录账号或设置代理");
  for (const name of ["存储服务", "内容平台", "GitHub", "S3", "微信读书", "Minimax", "扫码登录"])
    expect(text()).not.toContain(name);
  expect(document.body.querySelector('[aria-label="YouTube 代理"]')).toBeNull();
});
