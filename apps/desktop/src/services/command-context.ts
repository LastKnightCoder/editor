import type { DatabaseConnection } from "@/types/database-connection";

export interface CommandScope {
  databaseName?: string;
  connectionId?: string;
  signal?: AbortSignal;
}

const connections = new Map<string, DatabaseConnection>();
const connectionListeners = new Set<() => void>();
const capturedScopes = new WeakMap<CommandScope, CommandScope>();
let connected: DatabaseConnection | undefined;
const databaseKey = (name: string) => name.replace(/\.db$/, "");
export function rememberDatabaseConnection(connection: DatabaseConnection): void {
  connected = connection;
  updateDatabaseConnection(connection);
}

export function updateDatabaseConnection(connection: DatabaseConnection): void {
  const key = databaseKey(connection.databaseName);
  if (connected && databaseKey(connected.databaseName) === key) connected = connection;
  if (connections.get(key)?.connectionId === connection.connectionId) return;
  connections.set(key, connection);
  for (const listener of connectionListeners) listener();
}

export function getDatabaseConnection(databaseName: string): DatabaseConnection | undefined {
  return connections.get(databaseKey(databaseName));
}

export function subscribeDatabaseConnections(listener: () => void): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

export function databaseQueryKey<T extends readonly unknown[]>(key: T, connectionId?: string) {
  return connectionId ? ([...key, { connectionId }] as const) : key;
}

/** 覆盖后的旧查询等待页面换绑，不再由同步完成通知触发重试。 */
export function isCurrentDatabaseQuery(key: readonly unknown[]): boolean {
  const scope = key.find(
    part => part !== null && typeof part === "object" && "connectionId" in part
  );
  if (!scope || typeof scope !== "object" || !("connectionId" in scope)) return true;
  return [...connections.values()].some(
    connection => connection.connectionId === scope.connectionId
  );
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
        (scope.databaseName
          ? getDatabaseConnection(scope.databaseName)?.connectionId
          : undefined) ??
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
