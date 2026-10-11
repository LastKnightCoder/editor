import { afterEach, describe, expect, it, vi } from "vitest";
import Board from "../Board";
import {
  defineWhiteboardExtension,
  type WhiteboardExtension,
  type WhiteboardExtensionError,
} from "../extensions/api";
import { createDocumentExtension, createInteractionExtension } from "../extensions/builtins";
import { ViewPortTransforms } from "../transforms";
import { FIT_VIEW_PADDING } from "../constants";
import type { BoardElement } from "../types";
import type { IBoardPlugin } from "../types/board";
import { restoreHotkeyPlatform, stubHotkeyPlatform } from "./hotkey-platform-stub";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const shape: BoardElement = {
  id: "shape",
  type: "geometry",
  x: 10,
  y: 20,
  width: 100,
  height: 80,
} as BoardElement;

const keydown = (init: KeyboardEventInit & { target?: EventTarget }) => {
  const { target, ...rest } = init;
  const event = new KeyboardEvent("keydown", { cancelable: true, ...rest });
  if (target) Object.defineProperty(event, "target", { value: target });
  return event;
};

const boards: Board[] = [];
const install = (
  children: BoardElement[] = [],
  selected: BoardElement[] = [],
  extensions: readonly WhiteboardExtension[] = [createInteractionExtension()]
) => {
  const board = new Board(
    [...children],
    { ...viewport },
    { selectedElements: selected, selectArea: null }
  );
  boards.push(board);
  const errors: WhiteboardExtensionError[] = [];
  board.installExtensions(extensions, error => errors.push(error));
  return { board, errors };
};

/** 广播兜底插件：仲裁不拦截时 onKeyDown 仍应到达插件链 */
const broadcastProbe = () => {
  const probe: IBoardPlugin = { name: "test.broadcast-probe", onKeyDown: vi.fn() };
  return probe;
};

afterEach(() => {
  boards.splice(0).forEach(board => board.destroy());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("快捷键仲裁", () => {
  it("同键冲突时 tau 扩展优先；tau 命令不可用则执行第三方命令", () => {
    const thirdPartyRun = vi.fn();
    const tauRun = vi.fn();
    const thirdParty = defineWhiteboardExtension({
      id: "acme.hotkeys",
      create: () => ({
        commands: [{ id: "acme.hotkeys.run", execute: thirdPartyRun }],
        hotkeys: [{ key: "mod+9", command: "acme.hotkeys.run" }],
      }),
    });
    const tau = defineWhiteboardExtension({
      id: "tau.test-hotkeys",
      create: () => ({
        commands: [{ id: "tau.test-hotkeys.run", enabled: () => false, execute: tauRun }],
        hotkeys: [{ key: "mod+9", command: "tau.test-hotkeys.run" }],
      }),
    });
    // 第三方先装配，tau 仍应优先仲裁
    const { board } = install([], [], [thirdParty, tau]);
    const event = keydown({ key: "9", ctrlKey: true });
    board.onKeyDown(event);
    expect(event.defaultPrevented).toBe(true);
    expect(thirdPartyRun).toHaveBeenCalledOnce();
    expect(tauRun).not.toHaveBeenCalled();
  });

  it("同键条目全部不可用时不拦截，后续插件广播收到按键", () => {
    const disabled = defineWhiteboardExtension({
      id: "acme.off",
      create: () => ({
        commands: [{ id: "acme.off.run", enabled: () => false, execute: () => {} }],
        hotkeys: [{ key: "mod+9", command: "acme.off.run" }],
      }),
    });
    const { board } = install([], [], [disabled]);
    const probe = broadcastProbe();
    board.addPlugin(probe);
    const event = keydown({ key: "9", ctrlKey: true });
    board.onKeyDown(event);
    expect(event.defaultPrevented).toBe(false);
    expect(probe.onKeyDown).toHaveBeenCalledWith(event, board);
  });

  it("非 tau 扩展之间按装配顺序取第一条可用命令", () => {
    const first = vi.fn();
    const second = vi.fn();
    const make = (id: string, run: () => void) =>
      defineWhiteboardExtension({
        id,
        create: () => ({
          commands: [{ id: `${id}.run`, execute: run }],
          hotkeys: [{ key: "mod+9", command: `${id}.run` }],
        }),
      });
    const { board } = install([], [], [make("acme.first", first), make("acme.second", second)]);
    board.onKeyDown(keydown({ key: "9", ctrlKey: true }));
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it("命令执行抛错时 console.error 中文信息且按键已消费", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = defineWhiteboardExtension({
      id: "acme.broken",
      create: () => ({
        commands: [
          {
            id: "acme.broken.run",
            execute: () => {
              throw new Error("炸了");
            },
          },
        ],
        hotkeys: [{ key: "mod+9", command: "acme.broken.run" }],
      }),
    });
    const { board } = install([], [], [broken]);
    const probe = broadcastProbe();
    board.addPlugin(probe);
    const event = keydown({ key: "9", ctrlKey: true });
    board.onKeyDown(event);
    expect(event.defaultPrevented).toBe(true);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("acme.broken.run"),
      expect.any(Error)
    );
    expect(probe.onKeyDown).not.toHaveBeenCalled();
  });
});

describe("让位规则", () => {
  const cases: Array<[string, () => KeyboardEvent]> = [
    ["元素编辑中", () => keydown({ key: "a", ctrlKey: true })],
    [
      "焦点在输入框",
      () => keydown({ key: "a", ctrlKey: true, target: document.createElement("input") }),
    ],
    [
      "输入法组合",
      () => {
        const event = keydown({ key: "a", ctrlKey: true });
        Object.defineProperty(event, "isComposing", { value: true });
        return event;
      },
    ],
    ["演示态", () => keydown({ key: "a", ctrlKey: true })],
  ];

  it.each(cases)("%s 时快捷键不响应、不拦截", (name, makeEvent) => {
    const { board } = install([shape], []);
    if (name === "元素编辑中") board.isEditingElements = [shape.id];
    if (name === "演示态") board.presentationManager.isPresentationMode = true;
    const event = makeEvent();
    board.onKeyDown(event);
    expect(event.defaultPrevented).toBe(false);
    expect(board.selection.selectedElements).toEqual([]);
  });
});

describe("保留键与非法声明", () => {
  it.each(["mod+k", "Mod+K", "cmd+k", "ctrl+k", "alt+left", "Alt+ArrowLeft", "escape", "esc"])(
    "第三方声明保留键 %s 被拒 invalid-definition",
    key => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const rogue = defineWhiteboardExtension({
        id: "acme.reserve",
        create: () => ({
          commands: [{ id: "acme.reserve.run", execute: () => {} }],
          hotkeys: [{ key, command: "acme.reserve.run" }],
        }),
      });
      const { board, errors } = install([], [], [rogue]);
      expect(errors).toMatchObject([
        { extensionId: "acme.reserve", reason: "invalid-definition", target: key },
      ]);
      board.onKeyDown(keydown({ key: "9", ctrlKey: true }));
    }
  );

  it("tau 扩展声明保留键同样被拒", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const tau = defineWhiteboardExtension({
      id: "tau.reserved",
      create: () => ({
        commands: [{ id: "tau.reserved.run", execute: () => {} }],
        hotkeys: [{ key: "mod+j", command: "tau.reserved.run" }],
      }),
    });
    const { errors } = install([], [], [tau]);
    expect(errors).toMatchObject([
      { extensionId: "tau.reserved", reason: "invalid-definition", target: "mod+j" },
    ]);
  });

  it.each(["not+a", "zz", "mod+plus"])("无法解析的键串 %s 被拒", key => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rogue = defineWhiteboardExtension({
      id: "acme.unparsable",
      create: () => ({
        commands: [{ id: "acme.unparsable.run", execute: () => {} }],
        hotkeys: [{ key, command: "acme.unparsable.run" }],
      }),
    });
    const { errors } = install([], [], [rogue]);
    expect(errors).toMatchObject([
      { extensionId: "acme.unparsable", reason: "invalid-definition" },
    ]);
  });

  it("同一扩展内重复声明同一 key + command 被拒", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const duplicated = defineWhiteboardExtension({
      id: "acme.dupe",
      create: () => ({
        commands: [{ id: "acme.dupe.run", execute: () => {} }],
        hotkeys: [
          { key: "mod+9", command: "acme.dupe.run" },
          { key: "mod+9", command: "acme.dupe.run" },
        ],
      }),
    });
    const { errors } = install([], [], [duplicated]);
    expect(errors).toMatchObject([
      { extensionId: "acme.dupe", reason: "invalid-definition", target: "mod+9" },
    ]);
  });

  it("非 tau 扩展声明内部键码快捷键被拒", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rogue = defineWhiteboardExtension({
      id: "acme.codes",
      create: () => ({
        ...{ hotkeyCodes: [{ code: "Digit3", shift: true, command: "acme.codes.run" }] },
        commands: [{ id: "acme.codes.run", execute: () => {} }],
      }),
    });
    const { errors } = install([], [], [rogue]);
    expect(errors).toMatchObject([{ extensionId: "acme.codes", reason: "invalid-definition" }]);
  });
});

describe("内置快捷键（tau.interaction / tau.document）", () => {
  it("mod+z 撤销，mod+shift+z 与 mod+y 重做（mod+y 为新增别名）", () => {
    const { board } = install([shape], []);
    const moveTo = (x: number) =>
      board.apply(
        { type: "set_node", path: [0], properties: { x: shape.x }, newProperties: { x } },
        true
      );
    moveTo(40);
    expect(board.children[0].x).toBe(40);

    board.onKeyDown(keydown({ key: "z", ctrlKey: true }));
    expect(board.children[0].x).toBe(shape.x);

    board.onKeyDown(keydown({ key: "z", ctrlKey: true, shiftKey: true }));
    expect(board.children[0].x).toBe(40);

    board.onKeyDown(keydown({ key: "z", ctrlKey: true }));
    expect(board.children[0].x).toBe(shape.x);

    board.onKeyDown(keydown({ key: "y", ctrlKey: true }));
    expect(board.children[0].x).toBe(40);
  });

  it("无可撤销时 mod+z 不拦截", () => {
    const { board } = install([shape], []);
    const event = keydown({ key: "z", ctrlKey: true });
    board.onKeyDown(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("元素编辑中 mod+z / mod+a 让位给编辑器", () => {
    const { board } = install([shape], []);
    board.apply(
      { type: "set_node", path: [0], properties: { x: shape.x }, newProperties: { x: 40 } },
      true
    );
    board.isEditingElements = [shape.id];
    const undo = keydown({ key: "z", ctrlKey: true });
    board.onKeyDown(undo);
    expect(undo.defaultPrevented).toBe(false);
    expect(board.children[0].x).toBe(40);
  });

  it("mod+a 全选", () => {
    const other = { ...shape, id: "other" } as BoardElement;
    const { board } = install([shape, other], []);
    board.onKeyDown(keydown({ key: "a", ctrlKey: true }));
    expect(board.selection.selectedElements.map(node => node.id)).toEqual(["shape", "other"]);
  });

  it("delete / backspace 删除选中并清空选区", () => {
    for (const [key, keyCode] of [
      ["Delete", 46],
      ["Backspace", 8],
    ] as const) {
      const { board } = install([shape], [shape]);
      board.onKeyDown(keydown({ key, keyCode, which: keyCode }));
      expect(board.children).toEqual([]);
      expect(board.selection.selectedElements).toEqual([]);
    }
  });

  it("只读画布：delete 不执行且不拦截；mod+a 按现状仍拦截", () => {
    const { board } = install([shape], [shape]);
    board.readonly = true;
    const del = keydown({ key: "Delete", keyCode: 46, which: 46 });
    board.onKeyDown(del);
    expect(board.children).toHaveLength(1);
    expect(del.defaultPrevented).toBe(false);

    const all = keydown({ key: "a", ctrlKey: true });
    board.onKeyDown(all);
    expect(all.defaultPrevented).toBe(true);
    expect(board.selection.selectedElements).toEqual([shape]);
  });

  it("mod+= 放大、mod+- 缩小", () => {
    // updateZoom 需要挂载容器才能算出真实视口，这里只记录调用参数
    const zoom = vi.spyOn(ViewPortTransforms, "updateZoom");
    const { board } = install([shape], []);
    board.onKeyDown(keydown({ key: "=", ctrlKey: true }));
    expect(zoom).toHaveBeenCalledTimes(1);
    expect(zoom.mock.calls[0][1]).toBeCloseTo(1.1);
    board.onKeyDown(keydown({ key: "-", ctrlKey: true }));
    // 视口未真正提交（无容器），第二次仍从 zoom=1 起算：1 / 1.1
    expect(zoom.mock.calls[1][1]).toBeCloseTo(1 / 1.1);
  });

  it("mod+o 无选区全览全部、有选区全览选区并在下一帧恢复选中", async () => {
    const fit = vi.spyOn(ViewPortTransforms, "fitAllElements").mockImplementation(() => {});
    const empty = install([shape], []);
    empty.board.onKeyDown(keydown({ key: "o", ctrlKey: true }));
    expect(fit).toHaveBeenLastCalledWith(empty.board, FIT_VIEW_PADDING, true);

    const selected = install([shape], [shape]);
    selected.board.onKeyDown(keydown({ key: "o", ctrlKey: true }));
    expect(fit).toHaveBeenLastCalledWith(selected.board, FIT_VIEW_PADDING, true, [shape]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(selected.board.selection.selectedElements).toEqual([shape]);
  });

  it("z 全览，停在全览视角时再按 z 回到原视角", () => {
    const START = { ...viewport };
    const FIT = { minX: -400, minY: -300, width: 1600, height: 1200, zoom: 0.5 };
    vi.spyOn(ViewPortTransforms, "getFitViewport").mockReturnValue({ ...FIT });
    const animate = vi
      .spyOn(ViewPortTransforms, "animateToViewport")
      .mockImplementation((board, _start, end) => {
        board.viewPort = { ...end };
        return Promise.resolve();
      });
    const { board } = install([shape], []);

    const first = keydown({ key: "z" });
    board.onKeyDown(first);
    expect(first.defaultPrevented).toBe(true);
    expect(board.viewPort).toEqual(FIT);

    board.onKeyDown(keydown({ key: "z" }));
    expect(board.viewPort).toEqual(START);
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it("全览后手动改过视角，再按 z 重新全览而不是跳回旧视角", () => {
    const FIT = { minX: -400, minY: -300, width: 1600, height: 1200, zoom: 0.5 };
    vi.spyOn(ViewPortTransforms, "getFitViewport").mockReturnValue({ ...FIT });
    const animate = vi
      .spyOn(ViewPortTransforms, "animateToViewport")
      .mockImplementation((board, _start, end) => {
        board.viewPort = { ...end };
        return Promise.resolve();
      });
    const { board } = install([shape], []);

    board.onKeyDown(keydown({ key: "z" }));
    board.viewPort = { ...FIT, minX: FIT.minX + 120 };
    board.onKeyDown(keydown({ key: "z" }));

    expect(animate).toHaveBeenLastCalledWith(board, expect.anything(), FIT, expect.any(Number));
  });

  it("shift+1 适应全部、shift+2 适应选中（无选区不处理）、shift+0 回到 100%", () => {
    const fit = vi.spyOn(ViewPortTransforms, "fitAllElements").mockImplementation(() => {});
    const zoom = vi.spyOn(ViewPortTransforms, "updateZoom").mockImplementation(() => {});
    const { board } = install([shape], []);

    // shift+数字在布局间 event.key 漂移（!、@…），按 event.code 匹配
    board.onKeyDown(keydown({ key: "!", code: "Digit1", shiftKey: true }));
    expect(fit).toHaveBeenLastCalledWith(board, FIT_VIEW_PADDING, true);

    const noSelection = keydown({ key: "@", code: "Digit2", shiftKey: true });
    board.onKeyDown(noSelection);
    expect(fit).toHaveBeenCalledTimes(1);
    expect(noSelection.defaultPrevented).toBe(false);

    const selected = install([shape], [shape]);
    selected.board.onKeyDown(keydown({ key: "@", code: "Digit2", shiftKey: true }));
    expect(fit).toHaveBeenLastCalledWith(selected.board, FIT_VIEW_PADDING, true, [shape]);

    board.onKeyDown(keydown({ key: ")", code: "Digit0", shiftKey: true }));
    expect(zoom).toHaveBeenCalledWith(board, 1);
  });

  it("enter 单选文档卡时请求展开；未选中不展开", () => {
    const document_ = {
      id: "doc",
      type: "document",
      entityRef: { kind: "article", id: 3 },
      x: 0,
      y: 0,
      width: 280,
      height: 360,
    } as BoardElement;
    const open = vi.fn();
    const { board } = install(
      [document_],
      [document_],
      [createDocumentExtension({}), createInteractionExtension()]
    );
    board.on("tau.document.open", open);
    board.onKeyDown(keydown({ key: "Enter" }));
    expect(open).toHaveBeenCalledWith("doc");

    const idle = install([document_], []);
    idle.board.on("tau.document.open", open);
    idle.board.onKeyDown(keydown({ key: "Enter" }));
    expect(open).toHaveBeenCalledOnce();
  });
});

describe("getShortcut", () => {
  afterEach(restoreHotkeyPlatform);

  it("返回命令第一个绑定键的格式化文字（mac）", () => {
    stubHotkeyPlatform("mac");
    const document_ = {
      id: "doc",
      type: "document",
      entityRef: { kind: "article", id: 3 },
      x: 0,
      y: 0,
      width: 280,
      height: 360,
    } as BoardElement;
    const { board } = install(
      [document_],
      [document_],
      [createDocumentExtension({}), createInteractionExtension()]
    );
    const api = board.extensions!.api;
    expect(api.getShortcut("tau.history.undo")).toBe("⌘Z");
    expect(api.getShortcut("tau.selection.delete")).toBe("⌫");
    expect(api.getShortcut("tau.viewport.zoom-in")).toBe("⌘+");
    expect(api.getShortcut("tau.viewport.zoom-out")).toBe("⌘−");
    expect(api.getShortcut("tau.viewport.toggle-fit")).toBe("Z");
    expect(api.getShortcut("tau.document.open")).toBe("↵");
  });

  it("多个绑定返回第一个（redo 的 mod+shift+z 优先于 mod+y）", () => {
    stubHotkeyPlatform("mac");
    const { board } = install();
    expect(board.extensions!.api.getShortcut("tau.history.redo")).toBe("⇧⌘Z");
  });

  it("键码通道（shift+数字）也覆盖", () => {
    const cases: readonly [string, "mac" | "other", string][] = [
      ["tau.viewport.fit-all", "mac", "⇧1"],
      ["tau.viewport.fit-selection", "mac", "⇧2"],
      ["tau.viewport.zoom-reset", "mac", "⇧0"],
      ["tau.viewport.fit-all", "other", "Shift+1"],
    ];
    for (const [commandId, platform, expected] of cases) {
      stubHotkeyPlatform(platform);
      const { board } = install();
      expect(board.extensions!.api.getShortcut(commandId)).toBe(expected);
    }
  });

  it("other 平台显示 Ctrl 系", () => {
    stubHotkeyPlatform("other");
    const { board } = install([], [], [createDocumentExtension({}), createInteractionExtension()]);
    const api = board.extensions!.api;
    expect(api.getShortcut("tau.history.undo")).toBe("Ctrl+Z");
    expect(api.getShortcut("tau.history.redo")).toBe("Ctrl+Shift+Z");
    expect(api.getShortcut("tau.viewport.zoom-in")).toBe("Ctrl++");
    expect(api.getShortcut("tau.document.open")).toBe("Enter");
  });

  it("无绑定的命令返回 null", () => {
    stubHotkeyPlatform("mac");
    const extension = defineWhiteboardExtension({
      id: "acme.plain",
      create: () => ({ commands: [{ id: "acme.plain.run", execute: () => {} }] }),
    });
    const { board } = install([], [], [extension]);
    expect(board.extensions!.api.getShortcut("acme.plain.run")).toBeNull();
    expect(board.extensions!.api.getShortcut("tau.missing.command")).toBeNull();
  });

  it("第三方为既有命令追加绑定时，仍按仲裁顺序取 tau 在前的第一个绑定", () => {
    stubHotkeyPlatform("mac");
    const thirdParty = defineWhiteboardExtension({
      id: "acme.extra",
      create: () => ({
        commands: [{ id: "acme.extra.run", execute: () => {} }],
        hotkeys: [{ key: "mod+9", command: "tau.history.undo" }],
      }),
    });
    const { board } = install([], [], [createInteractionExtension(), thirdParty]);
    expect(board.extensions!.api.getShortcut("tau.history.undo")).toBe("⌘Z");
  });
});
