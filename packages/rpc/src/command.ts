/**
 * 命令契约工厂。
 *
 * 让主进程注册与渲染层调用共享同一份 channel 定义与请求/响应类型，
 * 消除双侧内联字符串的人工对齐与手动泛型断言。契约文件分层放置：
 * 零业务类型依赖的（如 setting）进 @tau/contracts 供 Web Server 复用，
 * 依赖 @/types 的留在 apps/desktop 内，待类型下沉后再上移。
 */

/** handler 依赖的 event 最小面（Electron 下为 IpcMainInvokeEvent 的结构子集） */
export interface CommandEvent {
  sender: unknown;
  senderFrame?: unknown;
  windowId?: number;
  sessionId?: string;
}

export type CommandHandler<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  event: CommandEvent,
  ...args: TArgs
) => TResult | Promise<TResult>;

/** 双侧运行时注入的桥：渲染侧只装配 call，主进程只装配 register */
export interface CommandBridge {
  call?(channel: string, args: unknown[]): Promise<unknown>;
  register?(channel: string, handler: CommandHandler): void;
}

let bridge: CommandBridge | null = null;

/** 装配命令桥（渲染侧经 commands/contracts/install，主进程经 ipc-registry-install） */
export function setCommandBridge(next: CommandBridge | null): void {
  bridge = next;
}

/** 契约定义登记表：主进程侧用于对账报告（模块级，两侧运行时各持一份） */
const definedChannels = new Set<string>();

export interface CommandRef<TArgs extends unknown[], TResult> {
  /** channel 字符串暴露，供暂未契约化的注册点（如 database.ts 包装层）引用常量 */
  readonly channel: string;
  call(...args: TArgs): Promise<TResult>;
  register(handler: (event: CommandEvent, ...args: TArgs) => TResult | Promise<TResult>): void;
}

/** 定义一条命令契约：channel 单一来源，调用/注册两端类型由此推导 */
export function command<TArgs extends unknown[], TResult>(
  channel: string
): CommandRef<TArgs, TResult> {
  definedChannels.add(channel);
  return {
    channel,
    call: (...args: TArgs) => {
      if (!bridge?.call) {
        throw new Error(
          `command "${channel}" 调用失败：当前运行时未装配 CommandBridge.call（渲染侧应确保 import commands/contracts/install）`
        );
      }
      return bridge.call(channel, args) as Promise<TResult>;
    },
    register: handler => {
      if (!bridge?.register) {
        throw new Error(
          `command "${channel}" 注册失败：当前运行时未装配 CommandBridge.register（主进程侧应经 ipc-registry-install 装配）`
        );
      }
      bridge.register(channel, handler as CommandHandler);
    },
  };
}

export function getDefinedCommandChannels(): string[] {
  return [...definedChannels];
}

export interface CommandCoverage {
  /** 已有契约定义的注册 channel */
  contracted: string[];
  /** 仍以内联字符串注册的存量 channel（迁移进度活清单） */
  uncontracted: string[];
}

/** 对账：已注册 channel 中哪些已有契约定义 */
export function auditCommandCoverage(registered: Iterable<string>): CommandCoverage {
  const contracted: string[] = [];
  const uncontracted: string[] = [];
  for (const channel of registered) {
    (definedChannels.has(channel) ? contracted : uncontracted).push(channel);
  }
  return { contracted, uncontracted };
}
