import type { WhiteboardAPI } from "./api";

/** 订阅归扩展所有，安装失败或卸载后不能留下监听器。 */
export function createExtensionScope(base: WhiteboardAPI, owner: string) {
  type Listener = (...args: any[]) => unknown;
  const cleanups = new Set<() => void>();
  const events = new Map<string, Map<Listener, () => void>>();
  let disposed = false;
  const guarded =
    (listener: Listener): Listener =>
    (...args) => {
      if (disposed) return;
      try {
        const result = listener(...args);
        if (result instanceof Promise)
          void result.catch(error => console.error(`白板扩展 ${owner} 监听失败`, error));
      } catch (error) {
        console.error(`白板扩展 ${owner} 监听失败`, error);
      }
    };
  const track = (dispose: () => void) => {
    const cleanup = () => {
      dispose();
      cleanups.delete(cleanup);
    };
    cleanups.add(cleanup);
    return cleanup;
  };
  const on: WhiteboardAPI["on"] = (event, listener) => {
    if (disposed) return;
    let group = events.get(event);
    if (!group) events.set(event, (group = new Map()));
    if (group.has(listener)) return;
    const wrapped = guarded(listener);
    base.on(event, wrapped);
    group.set(
      listener,
      track(() => {
        base.off(event, wrapped);
        group!.delete(listener);
      })
    );
  };
  const off: WhiteboardAPI["off"] = (event, listener) => events.get(event)?.get(listener)?.();
  const subscribe: WhiteboardAPI["subscribe"] = listener => {
    if (disposed) return () => {};
    return track(base.subscribe(guarded(listener)));
  };
  const api: WhiteboardAPI = Object.freeze(
    Object.create(base, {
      on: { value: on },
      off: { value: off },
      subscribe: { value: subscribe },
      captureSubmission: {
        value: (target?: string | import("../types").BoardElement) => {
          const valid = base.captureSubmission(target);
          return () => !disposed && valid();
        },
      },
      submit: {
        value: (...args: Parameters<WhiteboardAPI["submit"]>) => {
          if (!disposed) base.submit(...args);
        },
      },
      apply: {
        value: (...args: Parameters<WhiteboardAPI["apply"]>) => {
          if (!disposed) base.apply(...args);
        },
      },
      updateElement: {
        value: (...args: Parameters<WhiteboardAPI["updateElement"]>) =>
          !disposed && base.updateElement(...args),
      },
      select: {
        value: (...args: Parameters<WhiteboardAPI["select"]>) => {
          if (!disposed) base.select(...args);
        },
      },
      emit: {
        value: (...args: Parameters<WhiteboardAPI["emit"]>) => {
          if (!disposed) base.emit(...args);
        },
      },
      execute: {
        value: (...args: Parameters<WhiteboardAPI["execute"]>) =>
          disposed ? Promise.reject(new Error("扩展已卸载")) : base.execute(...args),
      },
    })
  );
  return {
    api,
    dispose() {
      disposed = true;
      for (const cleanup of [...cleanups]) cleanup();
    },
  };
}
