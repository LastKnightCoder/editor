import type { ServiceIdentifier } from "@tau/shared/service-contract";
import type { ServiceRegistry } from "@tau/shared/service-registry";
import type { WhiteboardAPI } from "./api";
import { resolveBoardAccess } from "./access";
import {
  assertEmittableEventName,
  assertSubscribableEventName,
  type KernelEventName,
} from "./events";

/** 扩展可用的宿主服务边界：注册表 + 装配期校验通过的声明清单 */
export interface ExtensionServiceScope {
  registry: ServiceRegistry;
  requires: readonly ServiceIdentifier<unknown>[];
  optional: readonly ServiceIdentifier<unknown>[];
}

/** 订阅归扩展所有，安装失败或卸载后不能留下监听器。 */
export function createExtensionScope(
  base: WhiteboardAPI,
  owner: string,
  services: ExtensionServiceScope
) {
  type Listener = (...args: any[]) => unknown;
  const cleanups = new Set<() => void>();
  // 扩展可发出的事件命名空间：扩展 id 第一段（如 "tau.arrow" → "tau"）
  const namespace = owner.slice(0, owner.indexOf("."));
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
  // 服务访问只能命中扩展声明过的 id：未声明属编程错误；optional 声明须经 tryGetService 显式降级
  const requiredServiceIds = new Set(services.requires.map(service => service.id));
  const declaredServiceIds = new Set([
    ...requiredServiceIds,
    ...services.optional.map(service => service.id),
  ]);
  const undeclaredError = (id: ServiceIdentifier<unknown>): Error =>
    new Error(
      `白板扩展 ${owner} 未声明服务 "${id.id}"，getService/tryGetService 只能获取 requires 或 optional 中声明过的服务`
    );
  const getService: WhiteboardAPI["getService"] = id => {
    if (!declaredServiceIds.has(id.id)) throw undeclaredError(id);
    if (!requiredServiceIds.has(id.id))
      throw new Error(`服务 "${id.id}" 是扩展 ${owner} 的可选依赖，请改用 tryGetService`);
    return services.registry.get(id);
  };
  const tryGetService: WhiteboardAPI["tryGetService"] = id => {
    if (!declaredServiceIds.has(id.id)) throw undeclaredError(id);
    return services.registry.tryGet(id);
  };
  const emit = (event: `${string}.${string}`, ...args: unknown[]): void => {
    if (disposed) return;
    assertEmittableEventName(event, namespace);
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
      select: {
        value: (...args: Parameters<WhiteboardAPI["select"]>) => {
          if (!disposed) base.select(...args);
        },
      },
      emit: { value: emit },
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
