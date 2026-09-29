import type { Editor, Element, Path } from "slate";

/**
 * 命令注册表（01 §5.1）：命令是编辑器的唯一动词层——热键、菜单、块面板、宿主
 * 都引用命令 id 触发动作，enablement（when）与错误隔离（按贡献扩展熔断）只有一份。
 */
export interface EditorCommandContext {
  /** 经热键触发时的键盘事件 */
  event?: React.KeyboardEvent<HTMLDivElement>;
  /** 调用方传参（如待插入的类型） */
  payload?: unknown;
  /** 入口针对的目标元素（块菜单打开的块）；热键路径没有 */
  element?: Element;
  /** 目标元素的路径（与 element 成对出现），命令省一次 ReactEditor.findPath */
  path?: Path;
}

export interface EditorCommand {
  /** 全局唯一；内置用 `tau.*`，宿主 `host.*`，第三方将来用作者命名空间 */
  id: string;
  /** 展示名（菜单 / 命令面板用），可省 */
  title?: string;
  /** enablement：false 时热键跳过、菜单灰显 */
  when?: (editor: Editor) => boolean;
  run: (editor: Editor, ctx: EditorCommandContext) => void;
}

/** 热键只绑命令 id，不绑函数 */
export interface EditorHotkey {
  key: string | string[];
  command: string;
}

export interface RegisteredCommand {
  readonly command: EditorCommand;
  /** 贡献者（扩展 id 或内核 "editor"）；熔断与上报按它计 */
  readonly owner: string;
}

export class CommandRegistry {
  private readonly commands = new Map<string, RegisteredCommand>();

  register(owner: string, commands: readonly EditorCommand[]): void {
    for (const command of commands) {
      const existing = this.commands.get(command.id);
      if (existing) {
        throw new Error(`[editor] 命令 "${command.id}" 同时由 ${existing.owner} 与 ${owner} 注册`);
      }
      this.commands.set(command.id, { command, owner });
    }
  }

  get(id: string): RegisteredCommand | undefined {
    return this.commands.get(id);
  }

  list(): readonly RegisteredCommand[] {
    return [...this.commands.values()];
  }
}

/** 命令执行的最小守卫接口（ExtensionCircuitBreaker 结构兼容） */
export interface CommandGuard {
  isDisabled(owner: string): boolean;
  record(owner: string, phase: "command", error: unknown): void;
}

export interface CommandDispatcher {
  /**
   * 执行命令。返回 false 表示未执行（没有这个命令会告警；when 不满足静默跳过），
   * 调用方据此决定要不要回落到别的处理。
   */
  execute(editor: Editor, id: string, ctx?: EditorCommandContext): boolean;
}

export function createCommandDispatcher(
  registry: CommandRegistry,
  guard: CommandGuard
): CommandDispatcher {
  return {
    execute: (editor, id, ctx) => {
      const registered = registry.get(id);
      if (!registered) {
        console.warn(`[editor] 命令 "${id}" 未注册`);
        return false;
      }
      if (registered.command.when && !registered.command.when(editor)) {
        return false;
      }
      if (guard.isDisabled(registered.owner)) return false;
      try {
        registered.command.run(editor, ctx ?? {});
      } catch (error) {
        guard.record(registered.owner, "command", error);
        return false;
      }
      return true;
    },
  };
}

/** 程序化执行命令的句柄，挂在 editor 实例上（热键、菜单与宿主统一入口） */
export interface EditorCommandsHandle {
  execute(id: string, payload?: unknown, element?: Element, path?: Path): boolean;
}
