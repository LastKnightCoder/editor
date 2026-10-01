import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { App } from "../src/host/App";

it("示例宿主把状态、只读和 Markdown 重载接到真实编辑器", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const button = (label: string) => {
    const match = [...host.querySelectorAll("button")].find(item => item.textContent === label);
    if (!match) throw new Error("缺少按钮：" + label);
    return match;
  };
  try {
    await act(async () => root.render(<App />));
    await act(async () => button("标记完成").click());
    expect(host.querySelector("[data-reminder]")?.getAttribute("data-done")).toBe("true");
    expect(host.querySelector("pre")?.textContent).toContain("done=true");
    await act(async () => button("切换只读").click());
    expect(button("已完成").disabled).toBe(true);
    expect(button("插入提醒").disabled).toBe(true);
    await act(async () => button("恢复编辑").click());
    await act(async () => button("从 Markdown 重新载入").click());
    expect(host.querySelector("[data-reminder]")?.getAttribute("data-done")).toBe("true");
    await act(async () => button("插入提醒").click());
    expect(host.querySelectorAll("[data-reminder]")).toHaveLength(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
