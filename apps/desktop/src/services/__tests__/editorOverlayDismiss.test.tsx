import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PageProvider, usePage } from "../../page/PageProvider";
import { definePage } from "../../page/definePage";
import { DesktopEditorOverlayDismiss } from "../editorOverlayDismiss";

definePage({
  key: "editor-overlay-test",
  match: "single",
  label: "编辑器浮层",
  status: "new",
  params: {},
  component: () => null,
});
function Probe() {
  const [first, setFirst] = useState(true);
  const [second, setSecond] = useState(true);
  const { state } = usePage();
  return (
    <div>
      <input aria-label="编辑上下文" />
      <output>{JSON.stringify({ first, second, pages: state.back.length })}</output>
      <DesktopEditorOverlayDismiss open={first} onDismiss={() => setFirst(false)} />
      <DesktopEditorOverlayDismiss open={second} onDismiss={() => setSecond(false)} />
    </div>
  );
}
it("Esc 在编辑上下文先按 LIFO 关闭编辑器浮层，不弹页面", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <PageProvider initialKey="editor-overlay-test">
          <Probe />
        </PageProvider>
      )
    );
    host.querySelector("input")?.focus();
    const pressEscape = () =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await act(async () => {
      pressEscape();
    });
    expect(JSON.parse(host.querySelector("output")!.textContent!)).toEqual({
      first: true,
      second: false,
      pages: 1,
    });
    await act(async () => {
      pressEscape();
    });
    expect(JSON.parse(host.querySelector("output")!.textContent!)).toEqual({
      first: false,
      second: false,
      pages: 1,
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
