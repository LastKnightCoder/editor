import { v4 as uuid } from "uuid";
import type Board from "../../Board";
import { BOARD_TO_CONTAINER } from "../../constants/map";
import { SELECT_TOOL_ID } from "../../constants/tools";
import type {
  CreateBuildContext,
  CreateBuildResult,
  CreateGestureSession,
  CreatePointerContext,
  CreatePoint,
  CreatePreviewOptions,
  CreateResult,
  CustomCreateGesture,
  ElementCreateSpec,
  WhiteboardElementDefinition,
} from "../../extensions/api";
import { WhiteboardValidationError } from "../../extensions/validation";
import type { BoardElement, Operation } from "../../types";
import { PointUtil } from "../../utils";
import { constrainCreateGeometry, type CreateGeometry } from "../createGesture";
import type { InteractionState } from "../InteractionState";

/** CustomCreateGesture.begin 的完整上下文（含预览入口） */
type CreateBeginContext = CreatePointerContext & {
  preview(element: BoardElement | null, options?: CreatePreviewOptions): void;
};

/** 判定为拖动（而非单击）的屏幕像素阈值 */
const DRAG_THRESHOLD_SCREEN = 4;
/** 取消时预览退场动画时长（ms） */
const PREVIEW_LEAVE_MS = 120;

const centeredRect = (
  center: CreatePoint,
  size: readonly [number, number]
): CreateGeometry["rect"] => ({
  x: center.x - size[0] / 2,
  y: center.y - size[1] / 2,
  width: size[0],
  height: size[1],
});

function invokeBuild(
  spec: ElementCreateSpec,
  ctx: CreateBuildContext
): BoardElement | CreateResult | null | Promise<CreateBuildResult | null> {
  return (
    (spec.build?.(ctx) as
      BoardElement | CreateResult | null | Promise<CreateBuildResult> | undefined) ?? null
  );
}

const isPromise = (value: unknown): value is Promise<unknown> =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { then?: unknown }).then === "function";

/** 指针样本：主事件或其 coalesced 中间点 */
type PointerSample = { clientX: number; clientY: number; pressure?: number };

/** 读取指针压力：MouseEvent（无 pressure 字段，如合成事件）按无压感鼠标的 0.5 处理 */
const readPressure = (sample: { pressure?: unknown }): number =>
  typeof sample.pressure === "number" ? sample.pressure : 0.5;

/**
 * 展开一次 pointermove 的全部指针样本：高频输入设备（笔/触控）的中间点经
 * getCoalescedEvents 取出，主事件与末尾样本重合时去重；无该 API（鼠标/合成事件）
 * 回退为仅主事件。事件可能是 React 合成事件，需经 nativeEvent 读取。
 */
function coalescedPointerSamples(event: PointerEvent): PointerSample[] {
  const native = (event as PointerEvent & { nativeEvent?: PointerEvent }).nativeEvent ?? event;
  const getCoalesced = (native as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] })
    .getCoalescedEvents;
  const samples: PointerSample[] =
    typeof getCoalesced === "function" ? [...getCoalesced.call(native)] : [];
  const last = samples[samples.length - 1] as (PointerSample & { timeStamp?: number }) | undefined;
  if (
    !last ||
    last.clientX !== native.clientX ||
    last.clientY !== native.clientY ||
    last.timeStamp !== native.timeStamp
  ) {
    samples.push(native);
  }
  return samples;
}

type BuiltinCommit = (result: CreateResult) => void;

/**
 * 内置 click 手势（CustomCreateGesture 的内部实现）：
 * 按下即以 defaultSize 居中于按下点构造并提交，无拖动阈值与预览。
 * commit 由 CreatingState 注入，保证规范化与撤销分组收口在内核；
 * build 异步时经 commitAsync 等待后提交。
 */
class ClickCreateGesture implements CustomCreateGesture {
  constructor(
    private readonly spec: ElementCreateSpec,
    private readonly options: Readonly<Record<string, unknown>> | null,
    private readonly commit: BuiltinCommit,
    private readonly commitAsync: (pending: Promise<CreateBuildResult | null>) => void
  ) {}

  begin(ctx: CreateBeginContext): CreateGestureSession {
    const size = this.spec.defaultSize as [number, number];
    const start = { ...ctx.start };
    const rect = centeredRect(start, size);
    const result = invokeBuild(this.spec, {
      rect,
      start,
      end: { ...start },
      click: true,
      shift: ctx.shift,
      alt: ctx.alt,
      options: this.options,
      api: ctx.api,
    });
    if (isPromise(result)) this.commitAsync(result);
    else if (result) this.commit(result);
    return {
      move: () => undefined,
      end: () => null,
    };
  }
}

/**
 * 内置 drag 手势（CustomCreateGesture 的内部实现）：
 * 超过屏幕阈值后开始预览，松手按最终约束 rect 提交；
 * 单击回落 defaultSize 居中创建（缺省则不创建），小于 minSize 不创建。
 */
class DragCreateGesture implements CustomCreateGesture {
  private start: CreatePoint | null = null;
  private moved = false;
  private boardApi: CreatePointerContext["api"] | null = null;

  constructor(
    private readonly spec: ElementCreateSpec,
    private readonly options: Readonly<Record<string, unknown>> | null
  ) {}

  begin(ctx: CreateBeginContext): CreateGestureSession {
    this.start = { ...ctx.start };
    this.boardApi = ctx.api;
    return {
      move: moveCtx => {
        const start = this.start;
        if (!start) return;
        if (!this.moved) {
          const screenDistance =
            Math.hypot(moveCtx.point.x - start.x, moveCtx.point.y - start.y) * moveCtx.zoom;
          if (screenDistance <= DRAG_THRESHOLD_SCREEN) return;
          this.moved = true;
        }
        // 异步 build 无法逐帧构造预览元素，拖动期间不显示预览
        const preview = this.buildElement(moveCtx);
        if (!isPromise(preview))
          ctx.preview(
            preview && typeof preview === "object" && "element" in preview
              ? preview.element
              : preview
          );
      },
      end: endCtx => {
        if (!this.start) return null;
        if (!endCtx.moved && !this.moved) return this.buildDefaultClick();
        if (!this.meetsMinSize(endCtx)) return null;
        // 元素为空或 Promise 由内核的提交路径裁决
        return this.buildElement(endCtx);
      },
      cancel: () => undefined,
    };
  }

  private buildElement(ctx: CreatePointerContext): BoardElement | CreateBuildResult | null {
    const start = this.start;
    if (!start) return null;
    const geometry = constrainCreateGeometry(
      this.spec.constrain ?? "box",
      start,
      ctx.point,
      ctx.shift,
      ctx.alt
    );
    return invokeBuild(this.spec, {
      rect: geometry.rect,
      start: geometry.start,
      end: geometry.end,
      click: false,
      shift: ctx.shift,
      alt: ctx.alt,
      options: this.options,
      api: ctx.api,
    }) as BoardElement | CreateBuildResult | null;
  }

  private buildDefaultClick(): BoardElement | CreateBuildResult | null {
    const start = this.start;
    const size = this.spec.defaultSize;
    const api = this.boardApi;
    if (!start || !size || !api) return null;
    return invokeBuild(this.spec, {
      rect: centeredRect(start, size),
      start: { ...start },
      end: { ...start },
      click: true,
      shift: false,
      alt: false,
      options: this.options,
      api,
    }) as BoardElement | CreateBuildResult | null;
  }

  private meetsMinSize(ctx: CreatePointerContext): boolean {
    const start = this.start;
    if (!start) return false;
    const min = this.spec.minSize ?? [4, 4];
    const geometry = constrainCreateGeometry(
      this.spec.constrain ?? "box",
      start,
      ctx.point,
      ctx.shift,
      ctx.alt
    );
    if ((this.spec.constrain ?? "box") === "line") {
      return (geometry.length ?? 0) >= Math.max(min[0], min[1]);
    }
    return geometry.rect.width >= min[0] && geometry.rect.height >= min[1];
  }
}
/** 异步创建提交等待中的画布：等待期间忽略新的创建手势（按下被吞掉，工具保持） */
const pendingAsyncCommits = new WeakSet<Board>();

/**
 * 创建手势状态：激活的创建型工具在 pointerdown 时最优先接管画布
 * （早于 claimed gesture 与插件广播），整个手势期间消费指针与 Esc/修饰键。
 * 内置 click/drag 均实现为 CustomCreateGesture，状态本身只消费 session 接口。
 */
export class CreatingState implements InteractionState {
  readonly name = "creating";
  isFinished = false;

  private board!: Board;
  private toolId!: string;
  private elementType!: string;
  private definition!: WhiteboardElementDefinition;
  private spec!: ElementCreateSpec;
  private session: CreateGestureSession | null = null;
  private pointerId: number | undefined;
  private api!: CreatePointerContext["api"];
  private startPoint: CreatePoint = { x: 0, y: 0 };
  private startScreen = { x: 0, y: 0 };
  private lastScreen = { x: 0, y: 0 };
  /** 最近一次指针事件的压力值（修饰键变化触发的重算沿用旧值；MouseEvent 合成事件缺省按 0.5） */
  private lastPressure = 0.5;
  private modifiers = { shift: false, alt: false };
  private moved = false;
  /** coalesced 批处理中：批内的 preview 调用挂起，批末只应用最后一次 */
  private batchingPreview = false;
  private batchPreviewPending = false;
  private batchPreviewElement: BoardElement | null = null;
  private batchPreviewOptions: CreatePreviewOptions | undefined;
  /** 已提交或已取消；此后工具切换等中断不再触发取消 */
  private settled = false;
  private readonly offListeners: (() => void)[] = [];

  /** pointerdown 仲裁：当前工具不是创建型（或会话拒绝接管）返回 null，走原手势路径 */
  static tryStart(board: Board, event: PointerEvent): CreatingState | null {
    if (event.button !== 0 || board.readonly || board.isDestroyed) return null;
    if (board.presentationManager.isPresentationMode) return null;
    const extensions = board.extensions;
    if (!extensions) return null;
    const createTool = extensions.getCreateTool(board.activeTool);
    const spec = createTool?.definition.create;
    if (!createTool || !spec) return null;
    const start = PointUtil.screenToViewPort(board, event.clientX, event.clientY);
    if (!start) return null;

    // 异步提交等待中：吞掉本次按下（消费事件、不创建、不复位工具、不开启新手势）
    if (pendingAsyncCommits.has(board)) {
      const state = new CreatingState();
      state.board = board;
      state.settled = true;
      state.session = { move: () => undefined, end: () => null };
      state.pointerId = event.pointerId;
      state.capturePointer(event);
      return state;
    }

    const state = new CreatingState();
    state.board = board;
    state.toolId = board.activeTool;
    state.elementType = createTool.elementType;
    state.definition = createTool.definition;
    state.spec = spec;
    state.api = extensions.api;
    state.pointerId = event.pointerId;
    state.startPoint = { ...start };
    state.startScreen = { x: event.clientX, y: event.clientY };
    state.lastScreen = { x: event.clientX, y: event.clientY };
    state.lastPressure = readPressure(event);
    state.modifiers = { shift: event.shiftKey, alt: event.altKey };

    const options = board.activeToolOptions;
    const gesture: CustomCreateGesture =
      typeof state.spec.gesture === "string"
        ? state.spec.gesture === "click"
          ? new ClickCreateGesture(
              state.spec,
              options,
              result => state.commit(result),
              pending => state.commitAsync(pending)
            )
          : new DragCreateGesture(state.spec, options)
        : state.spec.gesture;

    const session = gesture.begin(state.buildBeginContext());
    if (!session) return null;
    state.session = session;
    state.capturePointer(event);
    state.watchInterruptions();
    board.emit("create-gesture:start", state.toolId);
    return state;
  }

  onPointerMove(event: PointerEvent): boolean {
    this.modifiers = { shift: event.shiftKey, alt: event.altKey };
    // 一次 pointermove 携带的全部样本逐点驱动手势（采样规则在 session 内继续生效），
    // 多样本时预览批处理：批内 session.move 的 preview 调用只保留最后一次，批末应用
    const samples = coalescedPointerSamples(event);
    const batched = samples.length > 1;
    if (batched) this.batchingPreview = true;
    try {
      for (const sample of samples) this.ingestPointerSample(sample);
    } finally {
      if (batched) this.flushPreviewBatch();
    }
    return true;
  }

  private ingestPointerSample(sample: PointerSample): void {
    this.lastScreen = { x: sample.clientX, y: sample.clientY };
    this.lastPressure = readPressure(sample);
    if (
      !this.moved &&
      Math.hypot(sample.clientX - this.startScreen.x, sample.clientY - this.startScreen.y) >
        DRAG_THRESHOLD_SCREEN
    ) {
      this.moved = true;
    }
    this.driveMove();
  }

  onPointerUp(event: PointerEvent, board: Board): boolean {
    this.lastScreen = { x: event.clientX, y: event.clientY };
    this.lastPressure = readPressure(event);
    this.modifiers = { shift: event.shiftKey, alt: event.altKey };
    this.releasePointer();
    const point = PointUtil.screenToViewPort(board, event.clientX, event.clientY);
    if (!point) {
      // 容器已卸载：无法换算终点，按中断静默取消
      this.cancelSilently();
      this.isFinished = true;
      return true;
    }
    const result =
      this.session?.end({ ...this.buildPointerContext(point), moved: this.moved }) ?? null;
    if (isPromise(result)) this.commitAsync(result);
    else if (result) this.commit(result);
    else {
      this.settled = true;
      this.board.setCreationPreview(null);
    }
    this.isFinished = true;
    return true;
  }

  onGlobalPointerCancel(): boolean {
    this.releasePointer();
    this.cancelSilently();
    this.isFinished = true;
    return true;
  }

  onKeyDown(event: KeyboardEvent, board: Board): boolean {
    if (event.key === "Escape") {
      // 拖动中（或存在预览）才消费 Esc 取消手势；否则让位退出创建模式
      if (this.settled || (!this.moved && !board.creationPreview)) return false;
      event.preventDefault();
      this.cancelWithFade();
      return true;
    }
    if (event.key === "Shift" || event.key === "Alt") {
      this.modifiers = { shift: event.shiftKey, alt: event.altKey };
      this.driveMove();
    }
    return false;
  }

  onKeyUp(event: KeyboardEvent): boolean {
    if (event.key === "Shift" || event.key === "Alt") {
      this.modifiers = { shift: event.shiftKey, alt: event.altKey };
      this.driveMove();
    }
    return false;
  }

  onExit(): void {
    for (const off of this.offListeners.splice(0)) off();
    this.releasePointer();
    // 未收尾（画布失焦、工具切换、readonly、Board 销毁等）时静默取消；
    // 退场动画的定时器独立于状态存活，不在此时清理
    this.cancelSilently();
  }

  private buildPointerContext(point: CreatePoint): CreatePointerContext {
    return {
      point: { ...point },
      start: { ...this.startPoint },
      shift: this.modifiers.shift,
      alt: this.modifiers.alt,
      zoom: this.board.viewPort.zoom,
      pressure: this.lastPressure,
      api: this.api,
    };
  }

  private buildBeginContext(): CreateBeginContext {
    return {
      ...this.buildPointerContext(this.startPoint),
      preview: (element, options) => {
        if (this.batchingPreview) {
          this.batchPreviewPending = true;
          this.batchPreviewElement = element;
          this.batchPreviewOptions = options;
          return;
        }
        this.applyPreview(element, options);
      },
    };
  }

  /** 应用预览（含尺寸徽标计算；批末调用时使用最终指针状态） */
  private applyPreview(element: BoardElement | null, options?: CreatePreviewOptions): void {
    this.board.setCreationPreview(element, {
      highlight: options?.highlight,
      bounds: options?.bounds,
      sizeLabel: this.computeSizeLabel(),
    });
  }

  /** 批末应用挂起的预览：一次 native pointermove 内不论采样多少次只出图一次 */
  private flushPreviewBatch(): void {
    this.batchingPreview = false;
    const pending = this.batchPreviewPending;
    const element = this.batchPreviewElement;
    const options = this.batchPreviewOptions;
    this.batchPreviewPending = false;
    this.batchPreviewElement = null;
    this.batchPreviewOptions = undefined;
    if (!pending || this.settled) return;
    this.applyPreview(element, options);
  }

  private driveMove(): void {
    if (!this.session || this.settled) return;
    const point = PointUtil.screenToViewPort(this.board, this.lastScreen.x, this.lastScreen.y);
    if (!point) return;
    this.session.move(this.buildPointerContext(point));
  }

  /** 尺寸徽标文本：仅 drag 手势且已移动时（line 约束显示长度） */
  private computeSizeLabel(): string | undefined {
    if (this.spec.gesture !== "drag" || !this.moved) return undefined;
    const point = PointUtil.screenToViewPort(this.board, this.lastScreen.x, this.lastScreen.y);
    if (!point) return undefined;
    const geometry = constrainCreateGeometry(
      this.spec.constrain ?? "box",
      this.startPoint,
      point,
      this.modifiers.shift,
      this.modifiers.alt
    );
    return geometry.length !== undefined
      ? `${Math.round(geometry.length)}`
      : `${Math.round(geometry.rect.width)} × ${Math.round(geometry.rect.height)}`;
  }

  /** 提交创建结果：规范化 → 单批提交（恰好一个撤销步）→ 选中 → 工具复位 */
  private commit(result: CreateResult): void {
    this.settled = true;
    const board = this.board;
    const { element: rawElement, operations = [] } =
      "element" in result ? result : { element: result };

    let element = rawElement as BoardElement;
    if (!element || typeof element !== "object") return;
    if (!element.id) element = { ...element, id: uuid() };
    const definitionVersion = this.definition.schemaVersion;
    if (element.schemaVersion === undefined && (definitionVersion ?? 1) > 1) {
      element = { ...element, schemaVersion: definitionVersion };
    }

    board.setCreationPreview(null);

    const ops: Operation[] = [
      { type: "insert_node", path: [board.children.length], node: element },
      ...operations,
    ];
    // after=edit 暂无通用进入编辑入口（编辑态由各元素组件自持），当前与 select 等同
    const after = this.spec.after ?? "select";
    if (after !== "none") {
      ops.push({
        type: "set_selection",
        properties: board.selection,
        newProperties: { selectArea: null, selectedElements: [element] },
      });
    }

    try {
      board.apply(ops, true, `create:${uuid()}`);
    } catch (error) {
      if (error instanceof WhiteboardValidationError) {
        console.error(`创建元素 ${this.elementType} 失败，文档保持不变：${error.message}`);
        return;
      }
      throw error;
    }

    if (!this.spec.stay) board.setActiveTool(SELECT_TOOL_ID);
  }

  /**
   * 异步创建提交：等待期间登记 pending（忽略新的创建手势），完成后复用
   * captureSubmission 废弃守门并校验工具未被切换，再走同步提交路径；
   * reject 时打印中文错误、不插入、工具保持。
   */
  private commitAsync(pending: Promise<CreateBuildResult | null>): void {
    this.settled = true;
    const board = this.board;
    pendingAsyncCommits.add(board);
    void pending.then(
      result => {
        pendingAsyncCommits.delete(board);
        const element =
          result && typeof result === "object" && "element" in result ? result.element : result;
        if (!element || typeof element !== "object") {
          board.setCreationPreview(null);
          return;
        }
        // 画布销毁/失活/只读/期间被其它提交废弃，或工具已切换：丢弃结果
        if (!board.captureSubmission()() || board.activeTool !== this.toolId) {
          board.setCreationPreview(null);
          return;
        }
        this.commit(result as CreateResult);
      },
      error => {
        pendingAsyncCommits.delete(board);
        board.setCreationPreview(null);
        console.error(`创建元素 ${this.elementType} 失败，异步构造被拒绝，文档保持不变：`, error);
      }
    );
  }

  /** Esc 取消：会话取消 + 预览带 120ms 退场，工具保持 */
  private cancelWithFade(): void {
    this.settled = true;
    this.session?.cancel?.();
    const board = this.board;
    if (board.creationPreview) {
      board.markCreationPreviewLeaving();
      // 退场定时器独立于状态存活（onExit 不清理）
      setTimeout(() => board.setCreationPreview(null), PREVIEW_LEAVE_MS);
    }
    board.emit("create-gesture:cancel", this.toolId);
    this.isFinished = true;
  }

  /** 静默取消：pointercancel / 失焦 / 工具切换 / readonly / 销毁 */
  private cancelSilently(): void {
    if (this.settled) return;
    this.settled = true;
    this.session?.cancel?.();
    this.board.setCreationPreview(null);
    this.board.emit("create-gesture:cancel", this.toolId);
    this.isFinished = true;
  }

  private watchInterruptions(): void {
    const board = this.board;
    const onToolChange = (id: string) => {
      if (id !== this.toolId) this.cancelSilently();
    };
    const onReadonlyChange = (value: boolean) => {
      if (value) this.cancelSilently();
    };
    board.on("active-tool:change", onToolChange);
    board.on("readonlyChange", onReadonlyChange);
    this.offListeners.push(
      () => board.off("active-tool:change", onToolChange),
      () => board.off("readonlyChange", onReadonlyChange)
    );
  }

  private capturePointer(event: PointerEvent): void {
    const container = BOARD_TO_CONTAINER.get(this.board);
    if (!container || typeof container.setPointerCapture !== "function") return;
    try {
      container.setPointerCapture(event.pointerId);
    } catch {
      // 无激活指针（如测试合成事件）时捕获失败可安全忽略
    }
  }

  private releasePointer(): void {
    if (this.pointerId === undefined) return;
    const container = BOARD_TO_CONTAINER.get(this.board);
    if (!container || typeof container.releasePointerCapture !== "function") return;
    try {
      container.releasePointerCapture(this.pointerId);
    } catch {
      // 指针已释放时忽略
    }
  }
}
