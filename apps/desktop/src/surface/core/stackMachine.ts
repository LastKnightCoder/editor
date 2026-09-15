/**
 * 纯函数栈机 —— 无 React、无副作用，可单测（从移动端 router/core/stackMachine.ts 移植的最小核心）。
 *
 * 桌面化差异（相对移动端，见蓝图 §3.2/§3.7）：
 *  - 增加 forward buffer：back() 弹出的条目进 forward，push/replace 清空 forward（浏览器语义）；
 *  - LRU：超出上限返回应卸载的条目（PageHost 据此销毁保活实例）。
 *
 * 桌面不做的：window.history 同步（无系统返回键约束，栈机即唯一真相源）。
 */

export interface SurfaceEntry {
  /** 实例 id（key-时间戳-随机） */
  id: string;
  /** surface key（对应 defineSurface 的 key） */
  key: string;
  params: Record<string, unknown>;
  createdAt: number;
  lastActiveAt: number;
}

export interface StackMachineState {
  /** 后退栈（末位为当前） */
  back: SurfaceEntry[];
  /** 前进缓冲（末位为最近弹出；forward 时弹出压回 back） */
  forward: SurfaceEntry[];
}

export const MAX_LIVE_SURFACES = 12;

export function createEntry(key: string, params: Record<string, unknown>): SurfaceEntry {
  const now = Date.now();
  return {
    id: `${key}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    params,
    createdAt: now,
    lastActiveAt: now,
  };
}

export function initialState(): StackMachineState {
  return { back: [], forward: [] };
}

export function push(
  state: StackMachineState,
  key: string,
  params: Record<string, unknown>
): StackMachineState {
  const entry = createEntry(key, params);
  return {
    back: touchAll([...state.back, entry]),
    forward: [], // push 清空 forward（浏览器语义）
  };
}

export function replace(
  state: StackMachineState,
  key: string,
  params: Record<string, unknown>
): StackMachineState {
  const entry = createEntry(key, params);
  return {
    back: touchAll([...state.back.slice(0, -1), entry]),
    forward: [],
  };
}

/**
 * 单实例去重：命中谓词的条目激活之，不新建。
 *  - 命中条目在栈中：移到栈顶（视作新导航，清空 forward）；
 *  - 命中条目已在栈顶：参数相同则原样返回（同引用，调用方派发即无操作），
 *    参数有变化则原位更新（replace 语义，清空 forward）——否则 push 会重复入栈，
 *    出现"点当前页 → 后退按钮亮起但按了没反应"的假历史。
 */
export function activateExisting(
  state: StackMachineState,
  predicate: (entry: SurfaceEntry) => boolean,
  params: Record<string, unknown>
): StackMachineState | null {
  const index = state.back.findIndex(predicate);
  if (index === -1) return null;
  if (index === state.back.length - 1) {
    const top = state.back[index];
    if (sameParams(top.params, params)) return state;
    const back = [...state.back];
    back[index] = { ...top, params, lastActiveAt: Date.now() };
    return { back, forward: [] };
  }
  const back = [...state.back];
  const [entry] = back.splice(index, 1);
  return {
    back: touchAll([...back, entry]),
    forward: [], // 激活历史条目视作新导航
  };
}

/** params 值均为 schema 净化后的原始类型，浅比较即可 */
function sameParams(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every(k => a[k] === b[k]);
}

export function back(state: StackMachineState): StackMachineState | null {
  if (state.back.length <= 1) return null;
  const backStack = [...state.back];
  const popped = backStack.pop()!;
  return {
    back: touchAll(backStack),
    forward: [...state.forward, popped],
  };
}

export function forward(state: StackMachineState): StackMachineState | null {
  const fwd = [...state.forward];
  const popped = fwd.pop();
  if (!popped) return null;
  return {
    back: touchAll([...state.back, popped]),
    forward: fwd,
  };
}

export function popToTop(state: StackMachineState): StackMachineState {
  if (state.back.length <= 1) return state;
  return { back: touchAll([state.back[0]]), forward: [] };
}

export function current(state: StackMachineState): SurfaceEntry | undefined {
  return state.back[state.back.length - 1];
}

export function canBack(state: StackMachineState): boolean {
  return state.back.length > 1;
}

export function canForward(state: StackMachineState): boolean {
  return state.forward.length > 0;
}

/** LRU 候选：保活实例超出上限时应卸载的（非当前）条目，按最久未访问优先。 */
export function lruEvict(state: StackMachineState, limit = MAX_LIVE_SURFACES): SurfaceEntry[] {
  if (state.back.length <= limit) return [];
  const rest = state.back
    .slice(0, -1)
    .slice()
    .sort((a, b) => a.lastActiveAt - b.lastActiveAt);
  return rest.slice(0, state.back.length - limit);
}

function touchAll(back: SurfaceEntry[]): SurfaceEntry[] {
  const now = Date.now();
  const top = back[back.length - 1];
  return back.map(e => (e === top ? { ...e, lastActiveAt: now } : e));
}
