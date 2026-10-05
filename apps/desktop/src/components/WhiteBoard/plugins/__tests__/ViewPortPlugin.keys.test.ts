import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewPortPlugin } from "../ViewPortPlugin";
import { ViewPortTransforms } from "../../transforms";

const START = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const FIT = { minX: -400, minY: -300, width: 1600, height: 1200, zoom: 0.5 };

const createBoard = (overrides: Record<string, unknown> = {}) =>
  ({
    viewPort: { ...START },
    isEditingElements: [],
    selection: { selectedElements: [] },
    presentationManager: { isPresentationMode: false },
    ...overrides,
  }) as any;

const keydown = (init: KeyboardEventInit & { keyCode: number }, target?: HTMLElement) => {
  const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  // is-hotkey 按 which 匹配，jsdom 不从 init 推导 which
  Object.defineProperty(e, "which", { value: init.keyCode });
  if (target) {
    document.body.appendChild(target);
    target.dispatchEvent(e);
  }
  return e;
};
const Z = { key: "z", keyCode: 90 };

describe("ViewPortPlugin 视图快捷键", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("Z 全览，停在全览视角时再按 Z 回到原视角", () => {
    const plugin = new ViewPortPlugin();
    const board = createBoard();
    vi.spyOn(ViewPortTransforms, "getFitViewport").mockReturnValue({ ...FIT });
    const animate = vi
      .spyOn(ViewPortTransforms, "animateToViewport")
      .mockImplementation((b, _start, end) => {
        b.viewPort = { ...end };
        return Promise.resolve();
      });

    const first = keydown(Z);
    plugin.onKeyDown(first, board);
    expect(first.defaultPrevented).toBe(true);
    expect(board.viewPort).toEqual(FIT);

    plugin.onKeyDown(keydown(Z), board);
    expect(board.viewPort).toEqual(START);
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it("全览后手动改过视角，再按 Z 重新全览而不是跳回旧视角", () => {
    const plugin = new ViewPortPlugin();
    const board = createBoard();
    vi.spyOn(ViewPortTransforms, "getFitViewport").mockReturnValue({ ...FIT });
    const animate = vi
      .spyOn(ViewPortTransforms, "animateToViewport")
      .mockImplementation((b, _start, end) => {
        b.viewPort = { ...end };
        return Promise.resolve();
      });

    plugin.onKeyDown(keydown(Z), board);
    board.viewPort = { ...FIT, minX: FIT.minX + 120 };
    plugin.onKeyDown(keydown(Z), board);

    expect(animate).toHaveBeenLastCalledWith(board, expect.anything(), FIT, expect.any(Number));
  });

  it("编辑文字、焦点在输入框、输入法组合与演示中，单键和 shift+数字 都让位", () => {
    const fit = vi.spyOn(ViewPortTransforms, "fitAllElements").mockImplementation(() => {});
    const animate = vi.spyOn(ViewPortTransforms, "animateToViewport").mockResolvedValue(undefined);
    const plugin = new ViewPortPlugin();
    const cases: Array<[any, KeyboardEvent]> = [
      [createBoard({ isEditingElements: [{ id: "t" }] }), keydown(Z)],
      [createBoard(), keydown(Z, document.createElement("input"))],
      [createBoard(), keydown({ ...Z, isComposing: true })],
      [createBoard({ presentationManager: { isPresentationMode: true } }), keydown(Z)],
      [
        createBoard({ isEditingElements: [{ id: "t" }] }),
        keydown({ key: "!", keyCode: 49, shiftKey: true }),
      ],
    ];
    for (const [board, e] of cases) {
      plugin.onKeyDown(e, board);
      expect(e.defaultPrevented).toBe(false);
    }
    expect(fit).not.toHaveBeenCalled();
    expect(animate).not.toHaveBeenCalled();
  });

  it("shift+1 适应全部、shift+2 适应选中（无选区不处理）、shift+0 回到 100%", () => {
    const fit = vi.spyOn(ViewPortTransforms, "fitAllElements").mockImplementation(() => {});
    const zoom = vi.spyOn(ViewPortTransforms, "updateZoom").mockImplementation(() => {});
    const plugin = new ViewPortPlugin();

    plugin.onKeyDown(keydown({ key: "!", keyCode: 49, shiftKey: true }), createBoard());
    expect(fit).toHaveBeenLastCalledWith(expect.anything(), expect.any(Number), true);

    const noSelection = keydown({ key: "@", keyCode: 50, shiftKey: true });
    plugin.onKeyDown(noSelection, createBoard());
    expect(fit).toHaveBeenCalledTimes(1);
    expect(noSelection.defaultPrevented).toBe(false);

    const selected = [{ id: "a" }];
    plugin.onKeyDown(
      keydown({ key: "@", keyCode: 50, shiftKey: true }),
      createBoard({ selection: { selectedElements: selected } })
    );
    expect(fit).toHaveBeenLastCalledWith(expect.anything(), expect.any(Number), true, selected);

    plugin.onKeyDown(keydown({ key: ")", keyCode: 48, shiftKey: true }), createBoard());
    expect(zoom).toHaveBeenCalledWith(expect.anything(), 1);
  });
});
