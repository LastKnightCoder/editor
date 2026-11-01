import type { DatabaseConnection } from "@/types/database-connection";

export interface CommandScope {
  databaseName?: string;
  connectionId?: string;
  signal?: AbortSignal;
}

const connections = new Map<string, string>();
const capturedScopes = new WeakMap<CommandScope, CommandScope>();
let connected: DatabaseConnection | undefined;
const databaseKey = (name: string) => name.replace(/\.db$/, "");
export function rememberDatabaseConnection(connection: DatabaseConnection): void {
  connections.set(databaseKey(connection.databaseName), connection.connectionId);
  connected = connection;
}

let invoking: CommandScope | undefined;
export const currentCommandScope = (): CommandScope | undefined => invoking ?? connected;
export const invokingCommandScope = () => invoking;

/** 只捕获命令入口的同步调用栈；每次调用各自携带上下文，不在 await 期间修改全局状态。 */
export function bindDatabaseCommands<T extends object>(commands: T, scope?: CommandScope): T {
  scope ??= connected;
  let captured = scope && capturedScopes.get(scope);
  if (scope && !captured) {
    captured = {
      ...scope,
      connectionId:
        scope.connectionId ??
        (scope.databaseName ? connections.get(databaseKey(scope.databaseName)) : undefined) ??
        "",
    };
    capturedScopes.set(scope, captured);
  }
  // 构建产物会冻结模块导出；以可写副本承载代理，避免包装函数违反只读属性约束。
  return new Proxy(
    { ...commands },
    {
      get(_target, key) {
        const command = Reflect.get(commands, key);
        if (typeof command !== "function" || !captured) return command;
        return (...args: unknown[]) => {
          captured.signal?.throwIfAborted();
          const previous = invoking;
          invoking = captured;
          try {
            return Reflect.apply(command, commands, args);
          } finally {
            invoking = previous;
          }
        };
      },
    }
  );
}
