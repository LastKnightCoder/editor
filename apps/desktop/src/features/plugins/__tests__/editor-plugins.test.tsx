import { act, useLayoutEffect, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor as EditorView } from "@tau/editor";
import { captureEditorSubmission } from "@tau/editor/api";
import { Editor, Transforms } from "slate";
import { HistoryEditor } from "slate-history";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMemoryStorage } from "@tau/plugins/host";
import {
  defineEditorExtension,
  definePlugin,
  type Disposable,
  type PluginContext,
} from "@tau/plugins";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { PluginEditorSession } from "@/app/plugins/editorSession";
import { composePluginEditor } from "@/app/plugins/editorComposition";
import { editorPlugin } from "./fixtures/example/editorPlugin";
import { reminderCodec } from "./fixtures/example/reminderCodec";
import { PluginEditorWorkbench } from "../views/PluginEditorWorkbench";

let runtime: DesktopPluginRuntime;
let root: Root;
let container: HTMLDivElement;

function Harness({
  session,
  readonly = false,
}: {
  session: PluginEditorSession;
  readonly?: boolean;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useLayoutEffect(() => session.connect(), [session]);
  return (
    <EditorView
      key={state.generation}
      kit={state.kit}
      initValue={state.initialValue}
      readonly={readonly}
      onInit={session.attach}
      onChange={value => session.change(value, state.generation)}
    />
  );
}

beforeEach(() => {
  if (!Range.prototype.getBoundingClientRect)
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  runtime = new DesktopPluginRuntime({
    workspaceId: "A",
    storage: createMemoryStorage(),
    navigator: { push: vi.fn() },
    plugins: [editorPlugin],
    validateEditor: composePluginEditor,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await runtime.dispose();
  });
  container.remove();
});

const mount = async (session: PluginEditorSession, readonly = false) => {
  await act(async () =>
    root.render(
      <DndProvider backend={HTML5Backend}>
        <Harness session={session} readonly={readonly} />
      </DndProvider>
    )
  );
};

const editorOf = (session: PluginEditorSession) => {
  const editor = session.getEditor();
  if (!editor) throw new Error("编辑器未挂载");
  return editor;
};

it("真实编辑器插入、编辑、停用未知节点、恢复与跨切换撤销重做", async () => {
  const session = new PluginEditorSession(runtime);
  await mount(session);
  await act(async () => runtime.host.enable(editorPlugin.id));
  const editor = editorOf(session);
  await act(async () => {
    Transforms.select(editor, Editor.start(editor, [0]));
    editor.insertText("普通段落");
  });
  await act(async () => editor.commands?.execute("example.editor.insert"));
  await act(async () => HistoryEditor.withNewBatch(editor, () => editor.insertText("插件正文")));
  await act(async () =>
    editor.commands?.execute("example.editor.toggle", undefined, editor.children[1] as never)
  );
  const value = structuredClone(editor.children);
  const history = structuredClone(editor.history);
  const selection = structuredClone(editor.selection);
  const pending = captureEditorSubmission(editor);
  expect(container.querySelector("[data-plugin-reminder]")?.getAttribute("data-done")).toBe("true");
  const markdown = session.getSnapshot().markdown.getMarkdown(value);
  expect(session.getSnapshot().markdown.importFromMarkdown(markdown)).toEqual(value);

  await act(async () => runtime.host.disable(editorPlugin.id));
  expect(container.querySelector("[data-plugin-reminder]")).toBeNull();
  expect(container.textContent).toContain("example.editor.reminder");
  const disabledEditor = editorOf(session);
  expect(disabledEditor).not.toBe(editor);
  expect(disabledEditor.children).toEqual(value);
  expect(disabledEditor.history).toEqual(history);
  expect(disabledEditor.selection).toEqual(selection);
  expect(pending.commit(() => undefined).status).toBe("discarded");
  expect(disabledEditor.commands?.execute("example.editor.insert")).toBe(false);
  const missingMarkdown = session.getSnapshot().markdown.getMarkdown(disabledEditor.children);
  expect(session.getSnapshot().markdown.importFromMarkdown(missingMarkdown)).toEqual(value);
  await act(async () => Editor.normalize(disabledEditor, { force: true }));
  expect(disabledEditor.children).toEqual(value);

  await act(async () => runtime.host.enable(editorPlugin.id));
  const restored = editorOf(session);
  expect(restored.children).toEqual(value);
  expect(restored.history).toEqual(history);
  expect(container.querySelector("[data-plugin-reminder]")?.getAttribute("data-done")).toBe("true");
  await act(async () => restored.undo());
  expect(restored.children).not.toEqual(value);
  await act(async () => restored.redo());
  expect(restored.children).toEqual(value);
});

it("两个实例的正文与历史隔离，只读命令不写入，普通重绘不重建", async () => {
  await runtime.host.enable(editorPlugin.id);
  const first = new PluginEditorSession(runtime);
  const second = new PluginEditorSession(runtime);
  await act(async () =>
    root.render(
      <DndProvider backend={HTML5Backend}>
        <Harness session={first} />
        <Harness session={second} readonly />
      </DndProvider>
    )
  );
  const a = editorOf(first),
    b = editorOf(second);
  await act(async () => {
    a.commands?.execute("example.editor.insert");
    b.commands?.execute("example.editor.insert");
  });
  expect(a.children).toHaveLength(2);
  expect(b.children).toHaveLength(1);
  expect(b.history.undos).toHaveLength(0);
  expect(editorOf(first)).toBe(a);
  await act(async () => runtime.host.disable(editorPlugin.id));
  await act(async () => runtime.host.enable(editorPlugin.id));
  expect(editorOf(first).children).toHaveLength(2);
  expect(editorOf(second).children).toHaveLength(1);
});

it("开发台真实 UI 可使用、停用、恢复与只读，源码内容不被卸载吞掉", async () => {
  await runtime.host.enable(editorPlugin.id);
  await act(async () =>
    root.render(
      <DndProvider backend={HTML5Backend}>
        <PluginEditorWorkbench runtime={runtime} />
      </DndProvider>
    )
  );
  const button = (name: string) => {
    const found = [...container.querySelectorAll("button")].find(item => item.textContent === name);
    if (!found) throw new Error(`按钮不存在：${name}`);
    return found;
  };
  await act(async () => button("插入插件提醒").click());
  await act(async () => button("完成提醒").click());
  expect(container.querySelector("pre")?.textContent).toContain("done=true");
  await act(async () => button("切换只读").click());
  expect(button("提醒已完成").disabled).toBe(true);
  expect(button("插入插件提醒").disabled).toBe(true);
  await act(async () => runtime.host.disable(editorPlugin.id));
  expect(container.querySelector("[data-plugin-reminder]")).toBeNull();
  await act(async () => runtime.host.enable(editorPlugin.id));
  expect(button("提醒已完成").disabled).toBe(true);
});

it("注册冲突失败不破坏已打开编辑器；旧上下文不能重新注册", async () => {
  await runtime.host.enable(editorPlugin.id);
  const session = new PluginEditorSession(runtime);
  await mount(session);
  const editor = editorOf(session);
  let context!: PluginContext;
  runtime.host.registerTrusted(
    definePlugin({
      id: "conflict",
      name: "冲突",
      version: "1",
      create: () => ({
        activate(ctx) {
          context = ctx;
          ctx.editor.register({
            scene: "workbench",
            extension: defineEditorExtension({ id: "conflict.node" }),
            codecs: [reminderCodec],
          });
        },
      }),
    })
  );
  await act(async () => {
    await expect(runtime.host.enable("conflict")).rejects.toThrow("命名空间");
  });
  expect(editorOf(session)).toBe(editor);
  expect(runtime.getEditorContributions()).toHaveLength(1);
  expect(() =>
    context.editor.register({
      scene: "workbench",
      extension: defineEditorExtension({ id: "conflict.node" }),
    })
  ).toThrow();
  expect(() =>
    composePluginEditor([
      {
        scene: "workbench",
        extension: defineEditorExtension({
          id: "bad",
          commands: [
            { id: "same", run: () => undefined },
            { id: "same", run: () => undefined },
          ],
        }),
      },
    ])
  ).toThrow("同时");
  expect(() =>
    composePluginEditor([
      {
        scene: "workbench",
        extension: defineEditorExtension({ id: "duplicate-codec" }),
        codecs: [reminderCodec, reminderCodec],
      },
    ])
  ).toThrow("Markdown 类型重复");
});

it("停用立即撤销扩展，不等待异步 deactivate；旧命令句柄和只读实例均不可写", async () => {
  let finish!: () => void;
  const waiting = new Promise<void>(resolve => {
    finish = resolve;
  });
  runtime.host.registerTrusted(
    definePlugin({
      id: "delayed",
      name: "延迟回收",
      version: "1",
      create: () => ({
        activate(ctx) {
          ctx.editor.register({
            scene: "workbench",
            extension: defineEditorExtension({
              id: "delayed.commands",
              commands: [
                {
                  id: "delayed.write",
                  run(editor) {
                    editor.insertText("不应写入");
                  },
                },
              ],
            }),
          });
        },
        deactivate: () => waiting,
      }),
    })
  );
  await runtime.host.enable("delayed");
  const session = new PluginEditorSession(runtime);
  await mount(session, true);
  const oldEditor = editorOf(session);
  await act(async () => Transforms.select(oldEditor, Editor.start(oldEditor, [0])));
  expect(oldEditor.commands?.execute("delayed.write")).toBe(false);
  const value = structuredClone(oldEditor.children);
  let stopping!: Promise<void>;
  await act(async () => {
    stopping = runtime.host.disable("delayed");
  });
  expect(runtime.getEditorContributions()).toEqual([]);
  expect(oldEditor.commands?.execute("delayed.write")).toBe(false);
  expect(oldEditor.children).toEqual(value);
  await act(async () => {
    finish();
    await stopping;
  });
});

it("停用后的段落编辑与未知节点共存；宿主关闭撤销全部贡献", async () => {
  await runtime.host.enable(editorPlugin.id);
  const session = new PluginEditorSession(runtime);
  await mount(session);
  await act(async () => editorOf(session).commands?.execute("example.editor.insert"));
  const node = structuredClone(editorOf(session).children[1]);
  await act(async () => runtime.host.disable(editorPlugin.id));
  await act(async () => {
    const editor = editorOf(session);
    Transforms.select(editor, Editor.start(editor, [0]));
    editor.insertText("停用期间继续写作");
  });
  expect(editorOf(session).children[1]).toEqual(node);
  await act(async () => runtime.host.enable(editorPlugin.id));
  expect(Editor.string(editorOf(session), [0])).toBe("停用期间继续写作");
  await act(async () => runtime.dispose());
  expect(runtime.getEditorContributions()).toEqual([]);
  expect(editorOf(session).children[1]).toEqual(node);
});

it("贡献单独注销后旧编辑器句柄失效，同一次激活可再次登记", async () => {
  let context!: PluginContext;
  let resource!: Disposable;
  const contribution = {
    scene: "workbench" as const,
    extension: defineEditorExtension({
      id: "manual.commands",
      commands: [
        {
          id: "manual.write",
          run(editor) {
            editor.insertText("当前贡献");
          },
        },
      ],
    }),
  };
  runtime.host.registerTrusted(
    definePlugin({
      id: "manual",
      name: "手动注销",
      version: "1",
      create: () => ({
        activate(ctx) {
          context = ctx;
          resource = ctx.editor.register(contribution);
        },
      }),
    })
  );
  await runtime.host.enable("manual");
  const session = new PluginEditorSession(runtime);
  await mount(session);
  const previous = editorOf(session);
  await act(async () => Transforms.select(previous, Editor.start(previous, [0])));
  expect(() => context.editor.register(contribution)).toThrow("已注册");
  await act(async () => resource.dispose());
  expect(previous.commands?.execute("manual.write")).toBe(false);
  await act(async () => {
    context.editor.register(contribution);
  });
  expect(previous.commands?.execute("manual.write")).toBe(false);
  await act(async () => {
    expect(editorOf(session).commands?.execute("manual.write")).toBe(true);
  });
  expect(Editor.string(editorOf(session), [0])).toBe("当前贡献");
});
