import { bindWhiteboardAuthorAPI } from "./authorApi";
import type { ServiceRegistry } from "@tau/shared/service-registry";
import type { WhiteboardAPI } from "./api";
import { resolveBoardAccess } from "./access";
import {
  assertEmittableEventName,
  assertSubscribableEventName,
  type KernelEventName,
} from "./events";

/** 扩展可用的宿主服务边界：按扩展绑定的服务注册表 */
export interface ExtensionServiceScope {
  registry: ServiceRegistry;
}

/** 订阅归扩展所有，安装失败或卸载后不能留下监听器。 */
export function createExtensionScope(
  base: WhiteboardAPI,
  owner: string,
  services: ExtensionServiceScope,
  restricted = false
) {
  type Listener = (...args: any[]) => unknown;
  const cleanups = new Set<() => void>();
  // 作者使用完整插件身份，宿主扩展保留既有事件命名空间。
  const namespace = restricted ? owner : owner.split(".")[0];
  const events = new Map<string, Map<Listener, () => void>>();
  let disposed = false;
  let writesEnabled = false;
  const authorBridge = () => {
    const bridge = resolveBoardAccess(base).document?.author;
    return bridge && { ...bridge, canWrite: () => writesEnabled && bridge.canWrite() };
  };
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
  const on = (event: string, listener: (...args: any[]) => unknown): void => {
    if (disposed) return;
    assertSubscribableEventName(event);
    let group = events.get(event);
    if (!group) events.set(event, (group = new Map()));
    if (group.has(listener)) return;
    const wrapped = guarded(listener);
    // assertSubscribableEventName 已校验过事件名；两条重载签名互斥，统一按内核事件名收窄
    base.on(event as KernelEventName, wrapped);
    group.set(
      listener,
      track(() => {
        base.off(event, wrapped);
        group!.delete(listener);
      })
    );
  };
  const off: WhiteboardAPI["off"] = (event, listener) => events.get(event)?.get(listener)?.();
  const getService: WhiteboardAPI["getService"] = id => services.registry.get(id);
  const tryGetService: WhiteboardAPI["tryGetService"] = id => services.registry.tryGet(id);
  const emit = (event: `${string}.${string}`, ...args: unknown[]): void => {
    if (disposed) return;
    assertEmittableEventName(event, namespace);
    if (restricted && resolveBoardAccess(base).extensions?.authorOfEvent(event) !== owner)
      throw new Error("事件不属于此插件");
    // 不经主 API 转发（其 emit 限定 tau 命名空间），校验通过后直接走内核事件总线
    resolveBoardAccess(base).emit(event, ...args);
  };
  const onActiveToolChange: WhiteboardAPI["onActiveToolChange"] = listener => {
    if (disposed) return () => {};
    return track(base.onActiveToolChange(guarded(listener)));
  };
  const subscribe: WhiteboardAPI["subscribe"] = listener => {
    if (disposed) return () => {};
    return track(base.subscribe(guarded(listener)));
  };
  const api: WhiteboardAPI = Object.freeze(
    Object.create(base, {
      on: { value: on },
      off: { value: off },
      getService: { value: getService },
      tryGetService: { value: tryGetService },
      onActiveToolChange: { value: onActiveToolChange },
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
      setActiveTool: {
        value: (id: string, options?: Record<string, unknown>) => {
          if (disposed) return false;
          if (
            restricted &&
            id !== "tau.select" &&
            resolveBoardAccess(base).extensions?.authorOfTool(id) !== owner
          )
            throw new Error("工具不属于此插件");
          return base.setActiveTool(id, options);
        },
      },
      select: {
        value: (...args: Parameters<WhiteboardAPI["select"]>) => {
          if (!disposed) base.select(...args);
        },
      },
      emit: { value: emit },
      execute: {
        value: (...args: Parameters<WhiteboardAPI["execute"]>) =>
          disposed
            ? Promise.reject(new Error("扩展已卸载"))
            : restricted
              ? (resolveBoardAccess(base).extensions?.executeFor(owner, ...args) ??
                Promise.reject(new Error("作用域尚未就绪")))
              : base.execute(...args),
      },
    })
  );
  track(bindWhiteboardAuthorAPI(api, owner, authorBridge, () => !disposed));
  const readonlyAPI: WhiteboardAPI = Object.freeze(
    Object.create(api, {
      readonly: { value: true },
      captureSubmission: { value: () => () => false },
    })
  );
  track(bindWhiteboardAuthorAPI(readonlyAPI, owner, authorBridge, () => !disposed));
  return {
    api,
    readonlyAPI,
    enableWrites() {
      writesEnabled = true;
    },
    dispose() {
      disposed = true;
      for (const cleanup of [...cleanups]) cleanup();
    },
  };
}
