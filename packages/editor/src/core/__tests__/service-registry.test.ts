import { describe, expect, it, vi } from "vitest";
import { createServiceId } from "../../../api/services.ts";
import { createServiceRegistry, createChildRegistry } from "../services/registry";
import {
  IResourceService,
  IFileService,
  IOpenerService,
  type ResourceService,
} from "@tau/shared/host-services";
import { createEditorKit } from "../kit/EditorKit";

describe("服务注册表的迁移边界", () => {
  it("共用宿主契约保留原 id，旧标识对象与新入口读取同一个实例", async () => {
    const upload = vi.fn(async (file: File) => file.name);
    const resource: ResourceService = { upload };
    const kit = createEditorKit({
      services: [register => register(IResourceService, resource)],
    });
    const oldIdentifier = createServiceId<ResourceService>("resourceService");
    expect(kit.registry.get(oldIdentifier)).toBe(resource);
    expect(kit.registry.get(IResourceService)).toBe(resource);
    const file = new File(["内容"], "example.png");
    expect(await kit.registry.get(IResourceService).upload(file)).toBe("example.png");
    expect(upload).toHaveBeenCalledWith(file);
    expect(kit.registry.tryGet(IFileService)).toBeUndefined();
    expect(kit.registry.tryGet(IOpenerService)).toBeUndefined();
  });

  it("资源服务按协作场景派生覆盖，父服务和编辑器装配保持稳定", async () => {
    const parentUpload = vi.fn(async () => "parent://file");
    const childUpload = vi.fn(async () => "child://file");
    const parentRemoteToLocal = vi.fn(async () => "local://image");
    const parent = createEditorKit({
      services: [
        register =>
          register(IResourceService, {
            upload: parentUpload,
            remoteResourceToLocal: parentRemoteToLocal,
          }),
      ],
    });
    const derived = parent.extend({
      services: [
        register =>
          register(IResourceService, {
            ...parent.registry.get(IResourceService),
            upload: childUpload,
          }),
      ],
    });
    const file = new File(["内容"], "example.png");
    expect(await derived.registry.get(IResourceService).upload(file)).toBe("child://file");
    expect(parentUpload).not.toHaveBeenCalled();
    expect(parent.registry.get(IResourceService).upload).toBe(parentUpload);
    expect(derived.registry.get(IResourceService).remoteResourceToLocal).toBe(parentRemoteToLocal);
    expect(derived.assembly).toBe(parent.assembly);
  });

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
