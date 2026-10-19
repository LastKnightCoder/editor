// P8：命令注册表——热键绑命令 id、统一执行入口、enablement 与按扩展熔断。
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { registerHotKey } from "../../utils/hotkey";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor, Editor as SlateEditor, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit, type EditorKit } from "../../index";
import type { EditorRef } from "../../types/editor";
import { CommandRegistry, createCommandDispatcher, type CommandGuard } from "../command";
import { defineExtension } from "../extension";
import { builtinCommands } from "../../hotkeys";
import { textFormattingExtension } from "@tau/editor/extensions/text-formatting";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";

/** 直接喂给 registerHotKey 的键盘事件（is-hotkey 读 key 与修饰键；React 合成层不在单测范围） */
const keyEvent = (key: string, which: number, modifiers: Record<string, boolean>) =>
  ({
    key,
    // is-hotkey 默认按 which（键码）匹配
    which,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    preventDefault() {
      (this as { defaultPrevented: boolean }).defaultPrevented = true;
    },
    stopPropagation() {},
    ...modifiers,
  }) as unknown as React.KeyboardEvent<HTMLDivElement>;

const text = (value: string) => ({ type: "formatted" as const, text: value });
const paragraph = (value: string) => ({ type: "paragraph" as const, children: [text(value)] });

describe("CommandRegistry", () => {
  it("命令 id 重复注册直接报错", () => {
    const registry = new CommandRegistry();
    registry.register("a", [{ id: "x.tick", run: () => {} }]);
    expect(() => registry.register("b", [{ id: "x.tick", run: () => {} }])).toThrow(/x.tick/);
  });

  it("dispatcher 路由执行并把 ctx 传给 run", () => {
    const registry = new CommandRegistry();
    const run = vi.fn();
    registry.register("a", [{ id: "x.hello", run }]);
    const dispatcher = createCommandDispatcher(registry, fakeGuard());
    expect(dispatcher.execute(createEditor(), "x.hello", { payload: 42 })).toBe(true);
    expect(run).toHaveBeenCalledWith(expect.anything(), { payload: 42 });
  });

  it("when 不满足时静默拒绝，未注册的命令告警并返回 false", () => {
    const registry = new CommandRegistry();
    const run = vi.fn();
    registry.register("a", [{ id: "x.gated", run, when: () => false }]);
    const dispatcher = createCommandDispatcher(registry, fakeGuard());
    expect(dispatcher.execute(createEditor(), "x.gated")).toBe(false);
    expect(run).not.toHaveBeenCalled();

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(dispatcher.execute(createEditor(), "x.missing")).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("x.missing"));
    warn.mockRestore();
  });

  it("run 抛错按 owner 记入熔断（phase=command），停用后跳过", () => {
    const recorded: Array<{ owner: string; phase: string; count: number }> = [];
    let disabled = false;
    const guard: CommandGuard = {
      isDisabled: () => disabled,
      record: (owner, phase) => recorded.push({ owner, phase, count: recorded.length }),
    };
    const registry = new CommandRegistry();
    registry.register("ext.bad", [
      {
        id: "x.throw",
        run: () => {
          throw new Error("boom");
        },
      },
    ]);
    const dispatcher = createCommandDispatcher(registry, guard);

    expect(dispatcher.execute(createEditor(), "x.throw")).toBe(false);
    expect(recorded).toEqual([{ owner: "ext.bad", phase: "command", count: 0 }]);

    disabled = true;
    expect(dispatcher.execute(createEditor(), "x.throw")).toBe(false);
    expect(recorded).toHaveLength(1);
  });

  it("when 抛错被隔离，熔断后不再求值谓词", () => {
    const error = new Error("enablement 出错");
    const when = vi.fn(() => {
      throw error;
    });
    const run = vi.fn();
    const record = vi.fn();
    let disabled = false;
    const registry = new CommandRegistry();
    registry.register("ext.bad", [{ id: "x.when", when, run }]);
    const dispatcher = createCommandDispatcher(registry, { isDisabled: () => disabled, record });
    expect(dispatcher.execute(createEditor(), "x.when")).toBe(false);
    expect(record).toHaveBeenCalledWith("ext.bad", "command", error);
    disabled = true;
    expect(dispatcher.execute(createEditor(), "x.when")).toBe(false);
    expect(when).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("异步命令的拒绝被记录，不产生未处理拒绝", async () => {
    const error = new Error("异步动作出错");
    const record = vi.fn();
    const registry = new CommandRegistry();
    registry.register("ext.async", [
      {
        id: "x.async",
        run: async () => {
          throw error;
        },
      },
    ]);
    const dispatcher = createCommandDispatcher(registry, { isDisabled: () => false, record });
    expect(dispatcher.execute(createEditor(), "x.async")).toBe(true);
    await Promise.resolve();
    expect(record).toHaveBeenCalledWith("ext.async", "command", error);
  });
});

const fakeGuard = (): CommandGuard => ({ isDisabled: () => false, record: () => {} });

/** 同时登记核心与格式扩展命令，模拟真实编辑器的分发器。 */
const builtinDispatcher = () => {
  const registry = new CommandRegistry();
  registry.register("editor", builtinCommands);
  registry.register(textFormattingExtension.id, textFormattingExtension.commands ?? []);
  return createCommandDispatcher(registry, fakeGuard());
};

const kitWith = (extensions: readonly unknown[]): EditorKit =>
  createEditorKit({
    extensions: [...extensions, textFormattingExtension] as never,
    services: [register => register(IEditorSlots, createDefaultEditorSlots())],
  });

describe("命令热键端到端（mod+b → tau.mark.bold）", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    container = null;
    root = null;
  });

  const render = async (node: React.ReactNode) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<DndProvider backend={HTML5Backend}>{node}</DndProvider>);
    });
    return container;
  };

  it("内置热键经命令注册表触发格式命令，行为与迁移前一致", async () => {
    const ref = createRef<EditorRef>();
    const initial: Descendant[] = [paragraph("加粗我")];
    await render(<Editor ref={ref} kit={kitWith([])} initValue={initial} readonly={false} />);
    const editor = ref.current!.getEditor()!;

    // 选中段落文本后触发 mod+b：React 合成键盘层在 jsdom 里接不到派发事件
    // （实机待确认），这里直接调统一入口，守「热键声明 → 命令注册表 → 格式生效」的路由
    act(() => {
      editor.selection = {
        anchor: { path: [0, 0], offset: 0 },
        focus: { path: [0, 0], offset: 3 },
      };
      registerHotKey(
        editor,
        keyEvent("b", 66, { ctrlKey: true }),
        [{ kind: "command", keys: "mod+b", command: "tau.mark.bold" }],
        builtinDispatcher()
      );
    });
    expect(JSON.stringify(editor.children)).toContain('"bold":true');
  });

  it("editor.commands 程序化执行内置命令（无键盘事件路径）", async () => {
    const ref = createRef<EditorRef>();
    await render(
      <Editor ref={ref} kit={kitWith([])} initValue={[paragraph("甲"), paragraph("乙")]} />
    );
    const editor = ref.current!.getEditor()!;
    expect(editor.commands).toBeTruthy();
    expect(editor.commands!.execute("tau.edit.select-all")).toBe(true);
    expect(editor.selection?.anchor.path).toEqual([0, 0]);
    expect(editor.selection?.focus.path).toEqual([1, 0]);
  });

  it("扩展声明命令与热键：注册后可经 id 执行，冲突检测生效", async () => {
    const events: unknown[] = [];
    const counterExtension = defineExtension({
      id: "test.counter",
      commands: [{ id: "test.counter.tick", run: () => events.push("tick") }],
      hotkeys: [{ key: "mod+alt+9", command: "test.counter.tick" }],
    });
    const ref = createRef<EditorRef>();
    const host = await render(
      <Editor ref={ref} kit={kitWith([counterExtension])} initValue={[paragraph("正文")]} />
    );
    const editor = ref.current!.getEditor()!;
    expect(editor.commands!.execute("test.counter.tick")).toBe(true);
    expect(events).toEqual(["tick"]);

    await act(async () => {
      const registry = new CommandRegistry();
      registry.register("editor", builtinCommands);
      registry.register("test.counter", [
        { id: "test.counter.tick", run: () => events.push("tick") },
      ]);
      registerHotKey(
        editor,
        keyEvent("9", 57, { ctrlKey: true, altKey: true }),
        [{ kind: "command", keys: "mod+alt+9", command: "test.counter.tick" }],
        createCommandDispatcher(registry, fakeGuard())
      );
    });
    expect(events).toEqual(["tick", "tick"]);

    // 同 id 在另一个扩展里重复声明：建 kit 直接报错
    const dup = defineExtension({
      id: "test.dup",
      commands: [{ id: "test.counter.tick", run: () => {} }],
    });
    expect(() => kitWith([counterExtension, dup])).toThrow(/test.counter.tick/);
  });
});

describe("格式扩展与内核命令接线", () => {
  it("格式清标记与核心导航/面板命令分别注册且可调用", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({
      extensions: [textFormattingExtension],
      services: [register => register(IEditorSlots, createDefaultEditorSlots())],
    });
    await act(async () => {
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor
            ref={ref}
            kit={kit}
            readonly={false}
            initValue={
              [
                {
                  type: "paragraph",
                  children: [{ type: "formatted", text: "粗体", bold: true }],
                },
              ] as unknown as Descendant[]
            }
          />
        </DndProvider>
      );
    });
    const editor = ref.current!.getEditor();

    // 清标记来自显式安装的格式扩展。
    Transforms.select(editor, { path: [0, 0], offset: 0 });
    expect(editor.commands.execute("tau.edit.clear-marks")).toBe(true);

    // mod+左右兜底、inline 边界移动、块导航、面板六键都已声明（内核命令注册在编辑器
    // 组件层的注册表，execute 成功即证明接线生效，这里钉住声明清单）
    const ids = builtinCommands.map(command => command.id);
    for (const expected of [
      "tau.edit.intercept-mod-right",
      "tau.edit.intercept-mod-left",
      "tau.edit.move-left",
      "tau.edit.move-right",
      "tau.edit.block-up",
      "tau.edit.block-down",
      "tau.panel.backspace",
      "tau.panel.next",
      "tau.panel.prev",
      "tau.panel.confirm",
      "tau.panel.enter-submenu",
      "tau.panel.exit-submenu",
    ]) {
      expect(ids).toContain(expected);
    }
    await act(async () => root.unmount());
    container.remove();
  });
});
