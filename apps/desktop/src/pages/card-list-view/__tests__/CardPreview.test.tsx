import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CardPreview from "../CardPreview";

const { navigateToMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn(),
}));

vi.mock("ahooks", () => ({
  useCreation: (factory: () => unknown) => factory(),
  useMemoizedFn: <T extends (...args: any[]) => any>(fn: T) => fn,
  useRafInterval: () => undefined,
  useUnmount: () => undefined,
}));

vi.mock("antd", async () => {
  const ReactModule = await vi.importActual<typeof React>("react");
  return {
    App: {
      useApp: () => ({
        message: {
          warning: vi.fn(),
        },
      }),
    },
    Button: ({
      icon,
      onClick,
      ...props
    }: {
      icon?: React.ReactNode;
      onClick?: () => void;
      title?: string;
    }) => (
      <button type="button" onClick={onClick} {...props}>
        {icon}
      </button>
    ),
    Tooltip: ({ children, title }: { children: React.ReactElement; title: string }) =>
      ReactModule.cloneElement(children, { title } as any),
  };
});

vi.mock("@ant-design/icons", () => ({
  CloseOutlined: () => <span>关闭</span>,
  ExpandOutlined: () => <span>前往详情</span>,
}));

vi.mock("@/components/ContentEditor", () => ({
  default: () => <div data-testid="editor" />,
}));

vi.mock("@/components/AddTag", () => ({
  default: () => <div data-testid="add-tag" />,
}));

vi.mock("@/components/ErrorBoundary", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/CustomModal", () => ({
  default: ({
    children,
    open,
    title,
  }: {
    children: React.ReactNode;
    open: boolean;
    title?: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog">
        {title}
        {children}
      </div>
    ) : null,
}));

vi.mock("@/pages/CardDetailView/useEditCard", () => ({
  default: () => ({
    initValue: [{ type: "paragraph", children: [{ text: "内容" }] }],
    loading: false,
    editingCard: {
      id: 42,
      contentId: 7,
      tags: [],
      create_time: Date.now(),
      update_time: Date.now(),
      count: 2,
    },
    onContentChange: vi.fn(),
    onAddTag: vi.fn(),
    onDeleteTag: vi.fn(),
    onTagChange: vi.fn(),
    saveCard: vi.fn(),
    prevCard: { current: null },
    setEditingCard: vi.fn(),
    onInit: vi.fn(),
  }),
}));

vi.mock("@/hooks/useEditContent", () => ({
  default: () => ({
    throttleHandleEditorContentChange: vi.fn(),
  }),
}));

vi.mock("@/stores/useTabStore", () => ({
  default: (selector: (state: { navigateTo: typeof navigateToMock }) => unknown) =>
    selector({ navigateTo: navigateToMock }),
}));

vi.mock("@/stores/useDynamicExtensionsStore", () => ({
  default: (selector: (state: { extensions: never[] }) => unknown) => selector({ extensions: [] }),
}));

vi.mock("@/utils", () => ({
  defaultCardEventBus: {
    createEditor: () => ({
      publishCardEvent: vi.fn(),
      subscribeToCardWithId: vi.fn(() => vi.fn()),
    }),
  },
  formatDate: () => "2026-06-01",
}));

describe("CardPreview", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    navigateToMock.mockClear();
    if (root && container) {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    }
    root = null;
    container = null;
  });

  it("点击前往详情默认不关闭预览弹窗", async () => {
    const onClose = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<CardPreview cardId={42} visible={true} onClose={onClose} />);
    });

    const detailButton = container.querySelector(
      'button[title="前往详情"]'
    ) as HTMLButtonElement | null;
    expect(detailButton).not.toBeNull();

    await act(async () => {
      detailButton?.click();
    });

    expect(navigateToMock).toHaveBeenCalledWith(expect.anything(), { id: 42 }, "卡片详情 #42");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("点击前往详情后应触发调用方的详情跳转回调", async () => {
    const onClose = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <CardPreview cardId={42} visible={true} onClose={vi.fn()} onGoToDetail={onClose} />
      );
    });

    const detailButton = container.querySelector(
      'button[title="前往详情"]'
    ) as HTMLButtonElement | null;
    expect(detailButton).not.toBeNull();

    await act(async () => {
      detailButton?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
