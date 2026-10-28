import { act, forwardRef, useImperativeHandle, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import type { PluginContext, PluginEntityDescription } from "@tau/plugins";
import type { ContentDetailResponse } from "../../types";
import { PluginComponentScope } from "./component-scope";
import { MobilePluginsContext } from "./context";
import type { MobilePluginRuntime } from "./runtime";
import { mobileContentComponents } from "./content-components";
import { pluginLocationNode } from "./content-components-location";
import { previewBlockLimit } from "./content-components-view";
import * as tauri from "../../services/tauri";

const io = vi.hoisted(() => ({
  editors: [] as unknown[],
  local: vi.fn(),
  shared: vi.fn(),
  mention: vi.fn(),
  flush: vi.fn<() => Promise<void>>(async () => undefined),
}));
vi.mock("../../services/tauri", () => ({ getContentDetail: vi.fn(), updateContent: vi.fn() }));
vi.mock("@tau/editor", () => ({
  Editor: forwardRef(function FakeEditor(props: any, ref) {
    io.editors.push(props);
    useImperativeHandle(ref, () => ({
      getEditor: () => ({
        children: props.document?.initialValue ?? props.initValue ?? [],
        flushNodeTreeInputs: vi.fn(),
      }),
    }));
    return (
      <div data-editor data-kit={props.kit.name} data-readonly={String(props.readonly)}>
        {JSON.stringify(props.document?.initialValue ?? props.initValue ?? [])}
      </div>
    );
  }),
}));
vi.mock("../../services/editorKit", () => ({
  useMobileContentKit: (_mode: string, kind = "full") => ({ name: kind, extensions: [] }),
}));
vi.mock("../../hooks/useLocalContentDocument", () => ({
  default: (options: any) => {
    io.local(options);
    return options.metadata
      ? {
          lineage: `local:${options.metadata.librarySourceId}:${options.metadata.documentId}`,
          history: "external",
          initialValue: options.content,
          onChange: options.onChange,
          readonly: !options.canWrite(),
          flush: io.flush,
        }
      : undefined;
  },
}));
vi.mock("../../features/collaboration/hooks/useCollabSession", () => ({
  useCollabSession: (id: string, options: unknown) => {
    io.shared(id, options);
    return {
      document: {
        lineage: "shared-document",
        history: "external",
        initialValue: [{ type: "paragraph", children: [{ text: "协作正文" }] }],
      },
      presence: { onFocus: vi.fn(), onBlur: vi.fn() },
      readonly: false,
      offline: false,
      loading: false,
      ended: false,
    };
  },
}));
vi.mock("../../features/collaboration/hooks/useCollaborationRuntime", () => ({
  useCollaborationRuntime: () => undefined,
}));
vi.mock("../../features/collaboration/core/manager", () => ({
  collaborationManager: { flushCache: vi.fn(async () => undefined) },
}));
vi.mock("../../features/cards/editorToolbar/useMobileEditorToolbarController", () => ({
  useMobileEditorToolbarController: () => ({
    handleEditorFocus: vi.fn(),
    handleEditorBlur: vi.fn(),
    syncSelection: vi.fn(),
  }),
}));
vi.mock("../../features/cards/editorToolbar/MobileEditorBottomToolbar", () => ({
  MobileEditorBottomToolbar: () => null,
}));
vi.mock("../../features/cards/editorExtensions/ContentLinkPickerSheet", () => ({
  default: () => null,
}));
vi.mock("../../features/cards/editorExtensions/useContentMention", () => ({
  useContentMention: io.mention,
}));

const { ContentEditor, ContentPreview, EntityRef } = mobileContentComponents;
const nodes = (text: string): Descendant[] => [
  { type: "paragraph", children: [{ type: "formatted", text }] },
];
const initial: ContentDetailResponse = {
  contentId: 7,
  createTime: 1,
  updateTime: 1,
  content: nodes("原文"),
  count: 2,
  card: null,
  librarySourceId: "library",
  documentId: "body",
  revision: "revision",
  contracts: {},
};
const cleanups: (() => Promise<void>)[] = [];
function setup() {
  const controller = new AbortController();
  let revision = 0;
  const listeners = new Set<() => void>();
  let allowed = true;
  let writeAllowed = true;
  const notify = () => {
    revision++;
    listeners.forEach(listener => listener());
  };
  const request = vi.fn(async () => {
    allowed = true;
    writeAllowed = true;
    notify();
    return true;
  });
  const describe = vi.fn(
    async (refs: { kind: string; id: string }[]): Promise<PluginEntityDescription[]> =>
      refs.map(ref => ({ ref: ref as any, status: "ok", title: `标题${ref.id}` }))
  );
  const open = vi.fn(async () => undefined);
  const context = {
    pluginId: "test.components",
    workspaceId: "one.db",
    signal: controller.signal,
    permissions: { request },
    app: { describe, open },
  } as unknown as PluginContext;
  const snapshot = {
    owners: ["card"],
    own: false,
    document: initial,
    binding: null as string | null,
  };
  const resolve = vi.fn(async (_context: PluginContext, _ref: string, mode: string) =>
    mode === "write" && !writeAllowed
      ? { status: "prompt", permission: "cards:write" }
      : !allowed
        ? { status: "prompt", permission: "cards:read" }
        : { status: "granted", snapshot }
  );
  const save = vi.fn(async (_context: PluginContext, _ref: string, content: Descendant[]) => ({
    ...initial,
    content,
    revision: "saved",
    updateTime: 2,
  }));
  const project = vi.fn(async () => undefined);
  const presentation = vi.fn<() => Promise<{ label: string; icon: string } | null>>(async () => ({
    label: "周记",
    icon: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>',
  }));
  const runtime = {
    app: { presentation },
    subscribe: () => () => undefined,
    getSnapshot: () => 0,
    active: (value: PluginContext) => value === context && !controller.signal.aborted,
    data: {
      resolveComponentContent: resolve,
      saveComponentContent: save,
      projectComponentContent: project,
    },
    permissions: {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => revision,
    },
  } as unknown as MobilePluginRuntime;
  return {
    context,
    runtime,
    controller,
    request,
    describe,
    open,
    resolve,
    save,
    project,
    presentation,
    snapshot,
    notify,
    setRead(value: boolean) {
      allowed = value;
    },
    setWrite(value: boolean) {
      writeAllowed = value;
    },
  };
}
async function harness(state: ReturnType<typeof setup>, children: ReactNode, scoped = true) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const guards = new Set<() => boolean | Promise<boolean>>();
  const registerLeaveGuard = (guard: () => boolean | Promise<boolean>) => {
    guards.add(guard);
    return {
      dispose() {
        guards.delete(guard);
      },
    };
  };
  const render = async (value: ReactNode, active = true) =>
    act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MobilePluginsContext.Provider value={state.runtime}>
            {scoped ? (
              <PluginComponentScope
                context={state.context}
                active={active}
                registerLeaveGuard={registerLeaveGuard}
              >
                {value}
              </PluginComponentScope>
            ) : (
              value
            )}
          </MobilePluginsContext.Provider>
        </QueryClientProvider>
      )
    );
  cleanups.push(async () => {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
  });
  await render(children);
  return { container, render, guards };
}
async function settle(check: () => boolean) {
  for (let i = 0; i < 80 && !check(); i++)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  expect(check()).toBe(true);
}
const currentEditor = () => io.editors.at(-1) as any;
beforeEach(() => {
  vi.clearAllMocks();
  io.editors = [];
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

it("页面作用域外不加载正文或引用，也不申请权限", async () => {
  const state = setup();
  const { container } = await harness(
    state,
    <>
      <ContentPreview contentRef="7:1" />
      <EntityRef target={{ kind: "card", id: "1" }} />
    </>,
    false
  );
  expect(container.textContent).toContain("只能在插件页面");
  expect(state.resolve).not.toHaveBeenCalled();
  expect(state.describe).not.toHaveBeenCalled();
  expect(state.request).not.toHaveBeenCalled();
});

it("预览仅点击按钮申请权限，按块裁切且保留未知节点，撤权后不再显示正文", async () => {
  const state = setup();
  state.setRead(false);
  const unknown = {
    type: "unknown-plugin-block",
    opaque: { retain: true },
    children: [{ type: "formatted", text: "未知正文" }],
  } as unknown as Descendant;
  state.snapshot.document = {
    ...initial,
    content: [unknown, ...nodes("二"), ...nodes("三"), ...nodes("四")],
  };
  const { container } = await harness(state, <ContentPreview contentRef="7:1" />);
  await settle(() => container.textContent?.includes("允许访问") ?? false);
  expect(state.request).not.toHaveBeenCalled();
  expect(io.editors).toHaveLength(0);
  await act(async () => container.querySelector<HTMLButtonElement>("button")?.click());
  await settle(() => !!container.querySelector("[data-editor]"));
  expect(state.request).toHaveBeenCalledWith(["cards:read"]);
  expect(currentEditor().initValue).toEqual([unknown, ...nodes("二"), ...nodes("三")]);
  state.setRead(false);
  await act(async () => state.notify());
  expect(container.querySelector("[data-editor]")).toBeNull();
  expect(container.textContent).not.toContain("未知正文");
});

it("本地编辑复用保存协调并携带原版本，不调用活动库直写；权限变化立即关闭canWrite", async () => {
  const state = setup();
  const { container, guards } = await harness(state, <ContentEditor contentRef="7:1" />);
  await settle(() => !!container.querySelector("[data-editor]"));
  const options = io.local.mock.calls.at(-1)?.[0];
  expect(options.canWrite()).toBe(true);
  await act(async () => {
    options.onChange(nodes("修改"), {});
  });
  await act(async () => {
    for (const guard of guards) expect(await guard()).toBe(true);
  });
  expect(state.save).toHaveBeenCalledWith(state.context, "7:1", nodes("修改"), {}, "revision");
  expect(tauri.updateContent).not.toHaveBeenCalled();
  expect(tauri.getContentDetail).not.toHaveBeenCalled();
  state.setWrite(false);
  await act(async () => {
    state.notify();
    expect(options.canWrite()).toBe(false);
  });
  await settle(
    () => container.querySelector("[data-editor]")?.getAttribute("data-readonly") === "true"
  );
});

it("readonly和compact使用真实只读文档约束，compact禁用内容@入口", async () => {
  const state = setup();
  const { container } = await harness(
    state,
    <ContentEditor contentRef="7:1" readonly kit="compact" />
  );
  await settle(() => !!container.querySelector("[data-editor]"));
  expect(currentEditor().readonly).toBe(true);
  expect(currentEditor().kit.name).toBe("compact");
  expect(io.local.mock.calls.at(-1)?.[0].canWrite()).toBe(false);
  expect(io.mention.mock.calls.at(-1)?.[0].enabled).toBe(false);
  expect(state.save).not.toHaveBeenCalled();
});

it("冲洗本地草稿期间撤权，不再提交迟到的正文保存", async () => {
  const state = setup();
  const { container, guards } = await harness(state, <ContentEditor contentRef="7:1" />);
  await settle(() => !!container.querySelector("[data-editor]"));
  const options = io.local.mock.calls.at(-1)?.[0];
  await act(async () => options.onChange(nodes("待保存"), {}));
  let finish!: () => void;
  io.flush.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  const leave = [...guards][0];
  if (!leave) throw new Error("保存守卫未注册");
  let pending!: boolean | Promise<boolean>;
  await act(async () => {
    pending = leave();
  });
  state.setWrite(false);
  await act(async () => state.notify());
  await act(async () => finish());
  await expect(pending).resolves.toBe(false);
  expect(state.save).not.toHaveBeenCalled();
});

it("共享编辑消费原协作文档并使用受约束投影，不启动本地缓存分支", async () => {
  const state = setup();
  state.snapshot.binding = "shared-room";
  const { container } = await harness(state, <ContentEditor contentRef="7:1" />);
  await settle(() => container.textContent?.includes("协作正文") ?? false);
  expect(currentEditor().document.lineage).toBe("shared-document");
  expect(io.local).not.toHaveBeenCalled();
  const options = io.shared.mock.calls.at(-1)?.[1];
  expect(options.canWrite()).toBe(true);
  await options.project();
  expect(state.project).toHaveBeenCalledWith(state.context, "7:1", expect.any(Function));
  await act(async () => state.controller.abort());
  expect(options.canWrite()).toBe(false);
  expect(() => options.guard()).toThrow();
  expect(container.querySelector("[data-editor]")).toBeNull();
});

it("切换正文后迟到的旧正文不显示，停用后迟到加载也不交付", async () => {
  const state = setup();
  let finish!: (value: any) => void;
  state.resolve.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const { container, render } = await harness(state, <ContentPreview contentRef="old" />);
  await settle(() => state.resolve.mock.calls.length === 1);
  state.snapshot.document = { ...initial, content: nodes("新正文") };
  await render(<ContentPreview contentRef="new" />);
  await settle(() => container.textContent?.includes("新正文") ?? false);
  await act(async () =>
    finish({
      status: "granted",
      snapshot: { ...state.snapshot, document: { ...initial, content: nodes("旧秘密") } },
    })
  );
  expect(container.textContent).not.toContain("旧秘密");
  await act(async () => state.controller.abort());
  expect(container.querySelector("[data-editor]")).toBeNull();
});

it("引用批量描述，不自动申请权限，点击在手势内打开，删除态不打开", async () => {
  const state = setup();
  state.describe.mockImplementation(async refs =>
    refs.map(ref =>
      ref.id === "gone"
        ? { ref: ref as any, status: "missing" }
        : ref.id === "locked"
          ? { ref: ref as any, status: "denied", permission: "cards:read" }
          : { ref: ref as any, status: "ok", title: `标题${ref.id}` }
    )
  );
  const { container } = await harness(
    state,
    <>
      <EntityRef target={{ kind: "card", id: "one" }} />
      <EntityRef target={{ kind: "card", id: "gone" }} />
      <EntityRef target={{ kind: "card", id: "locked" }} />
      <EntityRef target={{ kind: "card", id: "text" }} openable={false} />
    </>
  );
  await settle(() => container.textContent?.includes("标题one") ?? false);
  expect(state.describe).toHaveBeenCalledOnce();
  expect(state.describe.mock.calls[0][0]).toHaveLength(4);
  expect(state.request).not.toHaveBeenCalled();
  expect(container.textContent).toContain("已删除");
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[title="标题one"]')?.click()
  );
  expect(state.open).toHaveBeenCalledWith({ kind: "card", id: "one" });
  expect(container.querySelector('button[title="标题text"]')).toBeNull();
  const permission = [...container.querySelectorAll("button")].find(
    button => button.textContent === "允许访问"
  );
  await act(async () => permission?.click());
  expect(state.request).toHaveBeenCalledWith(["cards:read"]);
});

it("预览上限和JSON定位具有明确回退语义", () => {
  expect([undefined, NaN, 0, -1, Infinity].map(previewBlockLimit)).toEqual([3, 3, 3, 3, 3]);
  expect(previewBlockLimit(500)).toBe(100);
  expect(previewBlockLimit(2.9)).toBe(2);
  const first = nodes("首块")[0];
  const task = { type: "check-list-item", taskId: "task", children: nodes("任务") } as Descendant;
  const content = [first, task];
  expect(pluginLocationNode(content, '{"block":1}')).toBe(task);
  expect(pluginLocationNode(content, '{"taskId":"task"}')).toBe(task);
  expect(pluginLocationNode(content, '{"block":99}')).toBe(first);
  expect(pluginLocationNode(content, "bad")).toBe(first);
});

it("插件实体只在描述获准后加载声明外观，图标使用CSS遮罩，失效后不保留标题或类型", async () => {
  const state = setup();
  const target = { kind: "plugin-entity", id: "7" } as const;
  const { container } = await harness(state, <EntityRef target={target} />);
  await settle(() => container.textContent?.includes("周记") ?? false);
  expect(state.presentation).toHaveBeenCalledWith(state.context, target);
  const icon = container.querySelector<HTMLElement>("span[aria-hidden]");
  expect(icon?.style.maskImage).toContain("data:image/svg+xml");
  expect(icon?.querySelector("svg")).toBeNull();
  state.presentation.mockResolvedValue(null);
  await act(async () => state.notify());
  expect(container.textContent).not.toContain("周记");
  await settle(() => container.textContent?.includes("引用已失效") ?? false);
  expect(container.textContent).not.toContain("标题7");
  expect(container.querySelector("button")).toBeNull();
});

it("未获准的插件实体不读取外观，撤权后迟到的外观也不显示", async () => {
  const state = setup();
  const target = { kind: "plugin-entity", id: "7" } as const;
  let finish!: (value: { label: string; icon: string }) => void;
  state.presentation.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const { container } = await harness(state, <EntityRef target={target} />);
  await settle(() => state.presentation.mock.calls.length === 1);
  state.describe.mockResolvedValue([{ ref: target, status: "denied", permission: null }]);
  await act(async () => state.notify());
  await act(async () => finish({ label: "旧类型", icon: "<svg/>" }));
  await settle(() => container.textContent?.includes("未获准查看") ?? false);
  expect(state.presentation).toHaveBeenCalledOnce();
  expect(container.textContent).not.toContain("旧类型");
  expect(container.textContent).not.toContain("标题7");
});
