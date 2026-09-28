export interface CommandScope {
  databaseName?: string;
  signal?: AbortSignal;
}

let invoking: CommandScope | undefined;
export const currentCommandScope = () => invoking;

/** 只捕获命令入口的同步调用栈；每次调用各自携带上下文，不在 await 期间修改全局状态。 */
export function bindDatabaseCommands<T extends object>(commands: T, scope?: CommandScope): T {
  return new Proxy(commands, {
    get(target, key, receiver) {
      const command = Reflect.get(target, key, receiver);
      if (typeof command !== "function" || !scope) return command;
      return (...args: unknown[]) => {
        scope.signal?.throwIfAborted();
        const previous = invoking;
        invoking = scope;
        try {
          return Reflect.apply(command, target, args);
        } finally {
          invoking = previous;
        }
      };
    },
  });
}
