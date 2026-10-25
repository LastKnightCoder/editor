/**
 * 配对请求的频率闸（纯逻辑，可单测）：同一扩展实例在窗口期内被拒绝达到上限后，冷却期内的请求
 * 静默丢弃，防止恶意或故障客户端反复弹窗。允许一次即清零。
 */
export const PAIR_DENY_LIMIT = 3;
export const PAIR_DENY_WINDOW_MS = 10 * 60 * 1000;
export const PAIR_COOLDOWN_MS = 10 * 60 * 1000;

interface DenyState {
  times: number[];
  blockedUntil: number;
}

export class PairingGate {
  private readonly states = new Map<string, DenyState>();

  constructor(private readonly now: () => number = Date.now) {}

  /** 可以弹窗返回 null；否则返回可再次请求的时间 */
  blockedUntil(clientId: string): number | null {
    const state = this.states.get(clientId);
    if (!state) return null;
    return state.blockedUntil > this.now() ? state.blockedUntil : null;
  }

  recordDenial(clientId: string): void {
    const now = this.now();
    const state = this.states.get(clientId) ?? { times: [], blockedUntil: 0 };
    state.times = [...state.times.filter(time => now - time < PAIR_DENY_WINDOW_MS), now];
    if (state.times.length >= PAIR_DENY_LIMIT) {
      state.blockedUntil = now + PAIR_COOLDOWN_MS;
      state.times = [];
    }
    this.states.set(clientId, state);
  }

  recordGrant(clientId: string): void {
    this.states.delete(clientId);
  }
}

/** 只放行浏览器扩展来源：Chrome 系与 Firefox；网页无法伪造 Origin，本机进程靠 token 兜底 */
const EXTENSION_ORIGIN = /^(chrome-extension:\/\/[a-p]{32}|moz-extension:\/\/[0-9a-f-]{36})$/;

export const isExtensionOrigin = (origin: string | undefined): origin is string =>
  typeof origin === "string" && EXTENSION_ORIGIN.test(origin);

const CLIENT_ID = /^[A-Za-z0-9_-]{16,64}$/;
export const isClientId = (value: unknown): value is string =>
  typeof value === "string" && CLIENT_ID.test(value);
