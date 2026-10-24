import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ConfigurationPanel } from "../ConfigurationPanel";
import { UiProvider } from "../../UiProvider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = "";
});

async function render(onSave: (value: Record<string, string>) => Promise<void>) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <UiProvider>
        <ConfigurationPanel
          initialValue={{ token: "original", path: "old" }}
          accountFields={[{ key: "token", label: "Token", type: "password" }]}
          fields={[{ key: "path", label: "目录" }]}
          onSave={onSave}
        />
      </UiProvider>
    )
  );
}
function button(text: string) {
  const element = [...document.querySelectorAll("button")].find(
    element => element.textContent === text
  );
  if (!element) throw new Error(`缺少按钮 ${text}`);
  return element;
}
function input(label: string) {
  const element = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!element) throw new Error(`缺少输入框 ${label}`);
  return element;
}
async function change(label: string, value: string, blur = false) {
  const element = input(label);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("输入框缺少标准 value setter");
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  if (blur)
    await act(async () => element.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
}
async function openAccount() {
  await act(async () => button("更换").click());
}
async function cancelAccount() {
  const close = document.querySelector<HTMLButtonElement>('button[aria-label="关闭"]');
  if (!close) throw new Error("缺少关闭入口");
  await act(async () => close.click());
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 240));
  });
}

it("取消账号草稿后，修改目录不会把草稿保存", async () => {
  const save = vi
    .fn<(value: Record<string, string>) => Promise<void>>()
    .mockResolvedValue(undefined);
  await render(save);
  await openAccount();
  await change("Token", "discarded");
  await cancelAccount();
  expect(save).not.toHaveBeenCalled();
  await change("目录", "new", true);
  expect(save).toHaveBeenLastCalledWith({ token: "original", path: "new" });
});

it("已排队的目录保存不会吸收后来输入的账号草稿", async () => {
  let finish!: () => void;
  const save = vi
    .fn<(value: Record<string, string>) => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    )
    .mockResolvedValue(undefined);
  await render(save);
  await change("目录", "first", true);
  await change("目录", "second", true);
  await openAccount();
  await change("Token", "discarded");
  await cancelAccount();
  await act(async () => finish());
  expect(save.mock.calls.map(([value]) => value)).toEqual([
    { token: "original", path: "first" },
    { token: "original", path: "second" },
  ]);
});

it("明确保存账号后，后续目录保存使用新账号", async () => {
  const save = vi
    .fn<(value: Record<string, string>) => Promise<void>>()
    .mockResolvedValue(undefined);
  await render(save);
  await openAccount();
  await change("Token", "committed");
  await act(async () => {
    button("保存账号").click();
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 240));
  });
  await change("目录", "new", true);
  expect(save).toHaveBeenLastCalledWith({ token: "committed", path: "new" });
});

it("排队保存失败时保留最新输入，不展示前一笔成功提示", async () => {
  let finish!: () => void;
  const save = vi
    .fn<(value: Record<string, string>) => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    )
    .mockRejectedValueOnce(new Error("写入失败"));
  await render(save);
  await change("目录", "first", true);
  await change("目录", "second", true);
  await act(async () => finish());
  expect(input("目录").value).toBe("second");
  expect(document.body.textContent).toContain("写入失败");
  expect(document.body.textContent).not.toContain("配置已保存");
});
