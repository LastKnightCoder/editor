import type { ServiceIdentifier } from "./service-contract.ts";

/**
 * 服务注册表：宿主平台能力的统一容器。
 * 注册与消费均以 ServiceIdentifier 匹配；可由编辑器、白板等宿主共享使用。
 */
export interface ServiceRegistry {
  /** 获取必选服务，未注册时抛出包含服务 id 的错误 */
  get<T>(id: ServiceIdentifier<T>): T;
  /** 获取可选服务，未注册时返回 undefined；用于消费侧显式降级 */
  tryGet<T>(id: ServiceIdentifier<T>): T | undefined;
  has<T>(id: ServiceIdentifier<T>): boolean;
}

/**
 * 注册单个服务。实现值既可以是实例，也可以是 `(registry) => impl` 工厂：
 * 工厂在首次 get 时才求值，因此注册顺序无关，且可在工厂内依赖其他服务。
 * 注意：注册的值如果本身是函数，会被视为工厂。
 */
export type ServiceRegister = <T>(
  id: ServiceIdentifier<T>,
  impl: T | ((registry: ServiceRegistry) => T)
) => void;

export type ServiceRegistration = (register: ServiceRegister) => void;

interface RegistryEntry {
  id: string;
  impl: unknown;
  instance?: unknown;
  resolved: boolean;
  resolving: boolean;
}

function createRegistry(
  parent: ServiceRegistry | null,
  registrations: ServiceRegistration[]
): ServiceRegistry {
  const entries = new Map<string, RegistryEntry>();

  const register: ServiceRegister = (id, impl) => {
    entries.set(id.id, { id: id.id, impl, resolved: false, resolving: false });
  };
  for (const registration of registrations) {
    registration(register);
  }

  const resolveEntry = (entry: RegistryEntry): unknown => {
    if (entry.resolved) {
      return entry.instance;
    }
    if (entry.resolving) {
      throw new Error(`服务 "${entry.id}" 存在循环依赖`);
    }
    entry.resolving = true;
    let instance: unknown;
    try {
      instance =
        typeof entry.impl === "function"
          ? (entry.impl as (registry: ServiceRegistry) => unknown)(registry)
          : entry.impl;
    } finally {
      entry.resolving = false;
    }
    if (instance == null) {
      throw new Error(`服务 "${entry.id}" 的注册结果为空值`);
    }
    entry.instance = instance;
    entry.resolved = true;
    return instance;
  };

  const registry: ServiceRegistry = {
    get<T>(id: ServiceIdentifier<T>): T {
      const entry = entries.get(id.id);
      if (entry) {
        return resolveEntry(entry) as T;
      }
      if (parent) {
        return parent.get(id);
      }
      throw new Error(`必选服务 "${id.id}" 未注册`);
    },
    tryGet<T>(id: ServiceIdentifier<T>): T | undefined {
      const entry = entries.get(id.id);
      if (entry) {
        return resolveEntry(entry) as T;
      }
      return parent?.tryGet(id);
    },
    has(id) {
      return entries.has(id.id) || (parent?.has(id) ?? false);
    },
  };

  return registry;
}

export function createServiceRegistry(...registrations: ServiceRegistration[]): ServiceRegistry {
  return createRegistry(null, registrations);
}

/**
 * 基于父注册表派生子注册表：get 时优先命中子级覆盖项，未命中则委托父级。
 * 用于协同编辑等需要按上下文覆盖个别服务的场景，覆盖粒度可到单个服务。
 */
export function createChildRegistry(
  parent: ServiceRegistry,
  ...overrides: ServiceRegistration[]
): ServiceRegistry {
  return createRegistry(parent, overrides);
}
