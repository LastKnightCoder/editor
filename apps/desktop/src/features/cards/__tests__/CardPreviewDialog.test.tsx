import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CardPreviewDialog } from "../components/CardPreviewDialog";
import { ECardCategory, type ICard } from "@/types/card";
import type { CardItemActions } from "../types";

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  tick: () => {},
  saved: vi.fn(),
  realDialog: false,
  delayEditor: false,
  editorReady: () => {},
  editorFailed: () => {},
}));
vi.mock("../queries", () => ({
  useCardsMutations: () => ({ patch: { mutateAsync: mocks.patch, isPending: false } }),
}));
vi.mock("ahooks", () => ({
  useRafInterval: (fn: () => void) => {
    mocks.tick = fn;
  },
  useUnmount: () => {},
}));
vi.mock("@/utils", () => ({ formatDate: () => "日期", getContentLength: () => 0 }));
vi.mock("@/hooks/useEditContent", () => ({
  default: () => ({ throttleHandleEditorContentChange: vi.fn() }),
}));
vi.mock("@/stores/useDynamicExtensionsStore", () => ({ default: () => [] }));
vi.mock("@/components/ContentEditor", () => ({
  default: function MockContentEditor({ contentId, onInit, onLoadError }: any) {
    mocks.editorReady = () => onInit?.({}, []);
    mocks.editorFailed = () => onLoadError?.("正文会话加载失败");
    useEffect(() => {
      if (!mocks.delayEditor) onInit?.({}, []);
    }, []);
    return <div data-testid="editor">正文 {contentId}</div>;
  },
}));
vi.mock("@/components/ErrorBoundary", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/AddTag", () => ({
  default: ({ tags, addTag }: { tags: string[]; addTag(tag: string): void }) => (
    <button onClick={() => addTag(`标签${tags.length + 1}`)}>标签：{tags.join(",")}</button>
  ),
}));
vi.mock("@tau/ui", async () => {
  const actual = await vi.importActual<typeof import("@tau/ui")>("@tau/ui");
  return {
    ...actual,
    Dialog: (props: any) =>
      mocks.realDialog ? (
        <actual.Dialog {...props} />
      ) : props.open ? (
        <div role="dialog">
          <button onClick={() => props.onOpenChange(false)}>关闭</button>
          {props.context}
          {props.children}
        </div>
      ) : null,
    IconButton: ({ children, onClick, title }: any) => (
      <button onClick={onClick} title={title}>
        {children}
      </button>
    ),
    Menu: Object.assign(({ children }: any) => <div>{children}</div>, {
      Item: ({ children, onSelect, disabled }: any) => (
        <button disabled={disabled} onClick={onSelect}>
          {children}
        </button>
      ),
      Submenu: ({ children }: any) => <div>{children}</div>,
      Separator: () => null,
    }),
    toast: { error: vi.fn(), info: vi.fn() },
  };
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let serverCard: ICard;
let setCard: React.Dispatch<React.SetStateAction<ICard>>;
function Harness() {
  const [card, update] = useState(serverCard);
  setCard = update;
  const actions: CardItemActions = {
    onOpen: vi.fn(),
    onOpenDetail: vi.fn(),
    onPresent: vi.fn(),
    onDelete: vi.fn(),
    onExportMarkdown: vi.fn(),
    onExportImage: vi.fn(),
    onExportEpub: vi.fn(),
    onExportPdf: vi.fn(),
    onToggleTop: () => {
      serverCard = { ...serverCard, isTop: !serverCard.isTop };
      update(serverCard);
    },
    onChangeCategory: (_card: ICard, category: ECardCategory) => {
      serverCard = { ...serverCard, category };
      update(serverCard);
    },
  };
  return (
    <CardPreviewDialog
      open
      card={card}
      actions={actions}
      onOpenChange={() => {}}
      onSaved={saved => {
        mocks.saved(saved);
        update(saved);
      }}
    />
  );
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(button =>
    button.textContent?.startsWith(text)
  );
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.realDialog = false;
  mocks.delayEditor = false;
  serverCard = {
    id: 1,
    contentId: 10,
    content: [],
    count: 0,
    tags: [],
    links: [],
    category: ECardCategory.Temporary,
    isTop: false,
    create_time: 0,
    update_time: 0,
  };
  mocks.patch.mockImplementation(async ({ patch }) => {
    serverCard = { ...serverCard, ...patch };
    return serverCard;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

it("未保存标签在分类与置顶刷新后仍保留，保存只提交标签", async () => {
  await click("标签：");
  await click("永久笔记");
  await click("设置置顶");
  expect(host.textContent).toContain("标签：标签1");
  expect(host.textContent).toContain("取消置顶");
  await act(async () => mocks.tick());
  expect(mocks.patch).toHaveBeenCalledWith({ id: 1, patch: { tags: ["标签1"] } });
  expect(mocks.saved).toHaveBeenCalledWith(
    expect.objectContaining({ category: ECardCategory.Permanent, isTop: true, tags: ["标签1"] })
  );
});

it("保存期间继续编辑标签，不会被前一次响应覆盖", async () => {
  let resolve!: (card: ICard) => void;
  mocks.patch.mockImplementationOnce(
    () =>
      new Promise<ICard>(done => {
        resolve = done;
      })
  );
  await click("标签：");
  await act(async () => mocks.tick());
  await click("标签：");
  await act(async () => {
    serverCard = { ...serverCard, tags: ["标签1"] };
    setCard(serverCard);
    resolve(serverCard);
  });
  expect(host.textContent).toContain("标签：标签1,标签2");
  await act(async () => mocks.tick());
  expect(mocks.patch).toHaveBeenLastCalledWith({ id: 1, patch: { tags: ["标签1", "标签2"] } });
});

it("全文与编辑状态就绪后才展示预览，关闭后迟到的数据不会重新打开", async () => {
  const onOpenChange = vi.fn();
  const props = { actions: {} as CardItemActions, onOpenChange };
  await act(async () => root.render(<CardPreviewDialog {...props} open card={null} />));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('[role="status"]')).toBeNull();
  await act(async () => root.render(<CardPreviewDialog {...props} open card={serverCard} />));
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  expect(host.textContent).toContain("标签：");
  await click("关闭");
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(mocks.patch).not.toHaveBeenCalled();
  await act(async () =>
    root.render(<CardPreviewDialog {...props} open={false} card={serverCard} />)
  );
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});

it("切换至尚未加载的卡片时不展示空弹窗或旧卡片", async () => {
  const props = { actions: {} as CardItemActions, onOpenChange: vi.fn() };
  await act(async () => root.render(<CardPreviewDialog {...props} open card={serverCard} />));
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => root.render(<CardPreviewDialog {...props} open card={null} />));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('[role="status"]')).toBeNull();
  await act(async () =>
    root.render(<CardPreviewDialog {...props} open card={{ ...serverCard, id: 2 }} />)
  );
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
});

it("读取失败在预览内显示错误并允许重试", async () => {
  const retry = vi.fn();
  await act(async () =>
    root.render(
      <CardPreviewDialog
        open
        card={null}
        actions={{} as CardItemActions}
        onOpenChange={() => {}}
        error="连接中断"
        onRetry={retry}
      />
    )
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("连接中断");
  await click("重试");
  expect(retry).toHaveBeenCalledTimes(1);
});

it("真实 Dialog 退场期间保留标题、正文与标签，动画完成才卸载", async () => {
  vi.useFakeTimers();
  mocks.realDialog = true;
  const props = { actions: {} as CardItemActions, onOpenChange: vi.fn() };
  await act(async () => root.render(<CardPreviewDialog {...props} open card={serverCard} />));
  await act(async () => vi.advanceTimersByTime(20));
  const dialog = document.querySelector('[role="dialog"]')!;
  const editor = dialog.querySelector('[data-testid="editor"]');
  const text = dialog.textContent;
  await act(async () => root.render(<CardPreviewDialog {...props} open={false} card={null} />));
  expect(dialog.textContent).toBe(text);
  expect(dialog.querySelector('[data-testid="editor"]')).toBe(editor);
  await act(async () => vi.advanceTimersByTime(199));
  expect(dialog.isConnected).toBe(true);
  expect(dialog.textContent).toBe(text);
  await act(async () => vi.advanceTimersByTime(1));
  expect(dialog.isConnected).toBe(false);
});

it("退场中重新打开另一张卡片，不会被旧的关闭任务清空", async () => {
  vi.useFakeTimers();
  mocks.realDialog = true;
  const props = { actions: {} as CardItemActions, onOpenChange: vi.fn() };
  await act(async () => root.render(<CardPreviewDialog {...props} open card={serverCard} />));
  await act(async () => root.render(<CardPreviewDialog {...props} open={false} card={null} />));
  await act(async () => vi.advanceTimersByTime(100));
  await act(async () =>
    root.render(
      <CardPreviewDialog {...props} open card={{ ...serverCard, id: 2, contentId: 20 }} />
    )
  );
  await act(async () => vi.advanceTimersByTime(300));
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain("卡片 #2");
  expect(dialog?.textContent).toContain("正文 20");
});

it("正文会话就绪前隐藏挂载，不抢焦点；编辑器初始化后才显示", async () => {
  vi.useFakeTimers();
  mocks.realDialog = true;
  mocks.delayEditor = true;
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  try {
    await act(async () =>
      root.render(
        <CardPreviewDialog
          open
          card={{ ...serverCard, id: 2 }}
          actions={{} as CardItemActions}
          onOpenChange={() => {}}
        />
      )
    );
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).not.toBe("hidden");
    await act(async () => mocks.editorReady());
    await act(async () => vi.advanceTimersByTime(20));
    expect(dialog.closest('[aria-hidden="true"]')).toBeNull();
    expect(document.activeElement).toBe(dialog);
  } finally {
    trigger.remove();
  }
});

it("正文会话加载失败也放行弹窗，不会永久隐藏", async () => {
  mocks.realDialog = true;
  mocks.delayEditor = true;
  await act(async () =>
    root.render(
      <CardPreviewDialog
        open
        card={{ ...serverCard, id: 2 }}
        actions={{} as CardItemActions}
        onOpenChange={() => {}}
      />
    )
  );
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.closest('[aria-hidden="true"]')).not.toBeNull();
  await act(async () => mocks.editorFailed());
  expect(dialog.closest('[aria-hidden="true"]')).toBeNull();
});
