import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toggleAssistFor, useAssistOwnerStore, useOwnAssist } from "../assistOwner";

function Owner({ toggle, active = true }: { toggle: () => void; active?: boolean }) {
  useOwnAssist("pdf-detail", toggle, active);
  return null;
}

const roots: Root[] = [];
function mount(node: React.ReactNode) {
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  act(() => root.render(node));
  return root;
}

afterEach(() => {
  roots.splice(0).forEach(root => act(() => root.unmount()));
  useAssistOwnerStore.setState({ owners: {} });
});

describe("页面接管 AI 对话开关", () => {
  it("栈顶页面接管后开关交给页面，否则开合壳层停靠栏", () => {
    const pageToggle = vi.fn();
    const dockToggle = vi.fn();
    const root = mount(<Owner toggle={pageToggle} />);

    toggleAssistFor("pdf-detail", dockToggle);
    expect(pageToggle).toHaveBeenCalledTimes(1);
    expect(dockToggle).not.toHaveBeenCalled();

    toggleAssistFor("home", dockToggle);
    expect(dockToggle).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    toggleAssistFor("pdf-detail", dockToggle);
    expect(dockToggle).toHaveBeenCalledTimes(2);
    expect(pageToggle).toHaveBeenCalledTimes(1);
  });

  it("总是调用最新的开关回调；停用即撤销注册", () => {
    const first = vi.fn();
    const second = vi.fn();
    const root = mount(<Owner toggle={first} />);
    act(() => root.render(<Owner toggle={second} />));
    toggleAssistFor("pdf-detail", vi.fn());
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();

    act(() => root.render(<Owner toggle={second} active={false} />));
    expect(useAssistOwnerStore.getState().owners).toEqual({});
  });

  it("先注册的实例卸载时不误删后注册的实例（保活切换的先后顺序）", () => {
    const a = mount(<Owner toggle={vi.fn()} />);
    const bToggle = vi.fn();
    mount(<Owner toggle={bToggle} />);
    act(() => a.unmount());
    toggleAssistFor("pdf-detail", vi.fn());
    expect(bToggle).toHaveBeenCalledTimes(1);
  });
});
