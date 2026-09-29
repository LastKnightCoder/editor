// P8：命令注册表——热键绑命令 id、统一执行入口、enablement 与按扩展熔断。
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { registerHotKey } from "../../utils/hotkey";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createBareEditorKit, type EditorKit } from "../../index";
import type { EditorRef } from "../../types/editor";
import { paragraph as paragraphExtension } from "../../extensions";
import { CommandRegistry, createCommandDispatcher, type CommandGuard } from "../command";
import { defineExtension } from "../extension";
import { builtinCommands } from "../../hotkeys";
import { createDefaultEditorSlots, IEditorSlots } from "../../services";

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

const text = (value: string) => ({ type: "formatted", text: value });
const paragraph = (value: string) => ({ type: "paragraph", children: [text(value)] });

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
});

const fakeGuard = (): CommandGuard => ({ isDisabled: () => false, record: () => {} });

/** 只含内核默认命令集的分发器（组件内的实例由装配生成，单测直接构造同构物） */
const builtinDispatcher = () => {
  const registry = new CommandRegistry();
  registry.register("editor", builtinCommands);
  return createCommandDispatcher(registry, fakeGuard());
};

const kitWith = (extensions: readonly unknown[]): EditorKit =>
  createBareEditorKit({
    extensions: extensions as never,
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
    await render(<Editor ref={ref} kit={kitWith([paragraphExtension])} initValue={initial} />);
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
      <Editor
        ref={ref}
        kit={kitWith([paragraphExtension])}
        initValue={[paragraph("甲"), paragraph("乙")]}
      />
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
      <Editor
        ref={ref}
        kit={kitWith([paragraphExtension, counterExtension])}
        initValue={[paragraph("正文")]}
      />
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
