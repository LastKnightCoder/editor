import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { StartupCodeFailure, StartupFailure } from "../StartupFailure";
import { mobileLocaleSource } from "../../services/i18n";

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
  mobileLocaleSource.setLocale("zh-CN");
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

it("失败后切换语言保留原始诊断与同一个重试动作", async () => {
  const onRetry = vi.fn();
  const detail = "external: 原始诊断 /private/path";
  const view = await mount(<StartupCodeFailure code="UNKNOWN" detail={detail} onRetry={onRetry} />);
  const retry = view.querySelector("button");
  expect(retry).not.toBeNull();
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(view.querySelector("button")).toBe(retry);
    expect(view.textContent).toContain(detail);
    expect(onRetry).not.toHaveBeenCalled();
  }
  await act(async () => retry?.click());
  expect(onRetry).toHaveBeenCalledTimes(1);
});
