import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { StartupFailure } from "../StartupFailure";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
async function mount(node: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

it("展示失败原因与原始错误，点重试回调", async () => {
  const onRetry = vi.fn();
  const view = await mount(
    <StartupFailure
      message="setting.json 格式无效，请检查配置"
      detail="SETTING_INVALID: 设置写入状态不可用"
      onRetry={onRetry}
    />
  );
  const alert = view.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain("Tau 没能完成启动");
  expect(alert?.textContent).toContain("setting.json 格式无效");
  expect(alert?.textContent).toContain("设置写入状态不可用");
  const retry = [...view.querySelectorAll("button")].find(item =>
    item.textContent?.includes("重试")
  );
  await act(async () => retry?.click());
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it("原始错误与说明相同时不重复展示", async () => {
  const view = await mount(
    <StartupFailure
      message="读取设置或打开数据库失败"
      detail="读取设置或打开数据库失败"
      onRetry={vi.fn()}
    />
  );
  expect(view.textContent?.match(/读取设置或打开数据库失败/g)).toHaveLength(1);
});
