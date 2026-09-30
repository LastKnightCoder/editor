import { describe, expect, it, vi } from "vitest";
import { createServiceId } from "../../api/services.ts";
import { createServiceRegistry, createChildRegistry } from "../services/registry";

describe("服务注册表的迁移边界", () => {
  const dependency = createServiceId<{ value: string }>("test.dependency");
  const consumer = createServiceId<{ dependency: { value: string } }>("test.consumer");

  it("同层后注册覆盖，工厂延迟求值且缓存实例", () => {
    const factory = vi.fn(() => ({ value: "覆盖" }));
    const registry = createServiceRegistry(register => {
      register(dependency, { value: "原值" });
      register(dependency, factory);
    });
    expect(factory).not.toHaveBeenCalled();
    expect(registry.get(dependency).value).toBe("覆盖");
    expect(registry.get(dependency)).toBe(registry.get(dependency));
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("子级覆盖不重建父级依赖，子级显式注册消费者才使用子级依赖", () => {
    const parent = createServiceRegistry(register => {
      register(dependency, { value: "父级" });
      register(consumer, registry => ({ dependency: registry.get(dependency) }));
    });
    const original = parent.get(consumer);
    const child = createChildRegistry(parent, register => register(dependency, { value: "子级" }));
    expect(child.get(consumer)).toBe(original);
    expect(child.get(consumer).dependency.value).toBe("父级");
    const local = createChildRegistry(child, register =>
      register(consumer, registry => ({ dependency: registry.get(dependency) }))
    );
    expect(local.get(consumer).dependency.value).toBe("子级");
  });

  it("未注册可选能力与真实工厂失败分别表达，循环依赖仍被检测", () => {
    expect(createServiceRegistry().tryGet(dependency)).toBeUndefined();
    const failed = createServiceRegistry(register => {
      register(dependency, () => {
        throw new Error("编译服务初始化失败");
      });
    });
    expect(() => failed.tryGet(dependency)).toThrow("编译服务初始化失败");
    const circular = createServiceRegistry(register => {
      register(dependency, registry => registry.get(dependency));
    });
    expect(() => circular.get(dependency)).toThrow("循环依赖");
  });
});
