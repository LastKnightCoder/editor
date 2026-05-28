import { describe, expect, it, beforeEach } from "vitest";
import useRightChatSidebarStore from "../useRightChatSidebarStore";

describe("stores/useRightChatSidebarStore 右侧面板互斥", () => {
  beforeEach(() => {
    useRightChatSidebarStore.setState({
      activePanel: null,
      width: 400,
      componentsWidth: 380,
      currentChatId: null,
    });
  });

  it("打开组件面板会关闭聊天面板", () => {
    const store = useRightChatSidebarStore.getState();

    store.setOpen(true);
    expect(useRightChatSidebarStore.getState().activePanel).toBe("chat");

    useRightChatSidebarStore.getState().setComponentsOpen(true);
    expect(useRightChatSidebarStore.getState().activePanel).toBe("components");
  });

  it("打开聊天面板会关闭组件面板", () => {
    const store = useRightChatSidebarStore.getState();

    store.setComponentsOpen(true);
    expect(useRightChatSidebarStore.getState().activePanel).toBe("components");

    useRightChatSidebarStore.getState().setOpen(true);
    expect(useRightChatSidebarStore.getState().activePanel).toBe("chat");
  });

  it("再次点击当前面板会关闭它", () => {
    const store = useRightChatSidebarStore.getState();

    store.toggleComponentsOpen();
    expect(useRightChatSidebarStore.getState().activePanel).toBe("components");

    useRightChatSidebarStore.getState().toggleComponentsOpen();
    expect(useRightChatSidebarStore.getState().activePanel).toBeNull();

    useRightChatSidebarStore.getState().toggleOpen();
    expect(useRightChatSidebarStore.getState().activePanel).toBe("chat");

    useRightChatSidebarStore.getState().toggleOpen();
    expect(useRightChatSidebarStore.getState().activePanel).toBeNull();
  });

  it("分别持久化聊天和组件面板宽度", () => {
    const store = useRightChatSidebarStore.getState();

    store.setWidth(460);
    store.setComponentsWidth(420);

    expect(useRightChatSidebarStore.getState().width).toBe(460);
    expect(useRightChatSidebarStore.getState().componentsWidth).toBe(420);
  });
});
