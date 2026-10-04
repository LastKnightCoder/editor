export interface CommandScope {
  databaseName?: string;
  signal?: AbortSignal;
}

let invoking: CommandScope | undefined;
export const currentCommandScope = () => invoking;

/** 只捕获命令入口的同步调用栈；每次调用各自携带上下文，不在 await 期间修改全局状态。 */
export function bindDatabaseCommands<T extends object>(commands: T, scope?: CommandScope): T {
  // 构建产物会冻结模块导出；以可写副本承载代理，避免包装函数违反只读属性约束。
  return new Proxy(
    { ...commands },
    {
      get(_target, key) {
        const command = Reflect.get(commands, key);
        if (typeof command !== "function" || !scope) return command;
        return (...args: unknown[]) => {
          scope.signal?.throwIfAborted();
          const previous = invoking;
          invoking = scope;
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
