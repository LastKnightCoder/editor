import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { definePage } from "../definePage";
import { registerPageMeta } from "../core/pageMeta";
import { PageProvider, usePage } from "../PageProvider";
import { PageHost } from "../PageHost";

it("缺失页面组件使用错误兜底，仍能通过页面栈恢复到今日", () => {
  registerPageMeta({ key: "missing-definition", match: "single", label: "测试页面", fields: {} });
  definePage({
    key: "home",
    label: "今日",
    match: "single",
    params: {},
    component: () => <span>恢复成功</span>,
  });
  function Host() {
    const { state } = usePage();
    return (
      <>
        <PageHost state={state} />
        <output>{state.back.at(-1)?.key}</output>
      </>
    );
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() =>
      root.render(
        <PageProvider initialKey="missing-definition">
          <Host />
        </PageProvider>
      )
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("页面暂时无法打开");
    const button = Array.from(container.querySelectorAll("button")).find(
      item => item.textContent === "回到今日"
    );
    if (!button) throw new Error("缺少恢复操作");
    act(() => button.click());
    expect(container.querySelector("output")?.textContent).toBe("home");
    expect(container.querySelector('[data-page-key="home"]')?.textContent).toBe("恢复成功");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
