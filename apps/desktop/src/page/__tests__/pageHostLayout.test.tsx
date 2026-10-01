import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { definePage } from "../definePage";
import { PageProvider, usePage } from "../PageProvider";
import { PageHost } from "../PageHost";

// jsdom 不做布局，只能守护结构：激活包装须是 BFC，视图根的 margin-top 才不会折叠出包装撑出 main 滚动条
it("激活页包装建立 BFC，兜住视图根外边距", () => {
  definePage({
    key: "page-host-layout",
    label: "布局测试",
    match: "single",
    params: {},
    component: () => <div className="mt-1 h-full">内容</div>,
  });
  function Host() {
    const { state } = usePage();
    return <PageHost state={state} />;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() =>
      root.render(
        <PageProvider initialKey="page-host-layout">
          <Host />
        </PageProvider>
      )
    );
    const wrapper = container.querySelector('[data-page-key="page-host-layout"]');
    expect(wrapper?.classList.contains("h-full")).toBe(true);
    expect(wrapper?.classList.contains("flow-root")).toBe(true);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
