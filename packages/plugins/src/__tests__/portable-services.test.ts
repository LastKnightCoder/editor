import { expect, it, vi } from "vitest";
import { scopePortablePluginModules } from "../portable-services";

it("节点插入使用编辑器基础要求，不要求源码编辑界面", () => {
  const insertSourceBlock = vi.fn();
  const modules = { "@tau/plugins": { insertSourceBlock } };
  const scoped = scopePortablePluginModules(
    modules,
    { minAppVersion: "1.0.0", required: ["editor"], optional: [] },
    ["editor"]
  );
  (scoped["@tau/plugins"] as (typeof modules)["@tau/plugins"]).insertSourceBlock();
  expect(insertSourceBlock).toHaveBeenCalledOnce();
});

it("可选编译器缺失时返回 undefined，其他源码操作保持可用", () => {
  const update = vi.fn();
  const modules = {
    "@tau/plugins": { useSourceBlock: () => ({ update, compiler: { compile: vi.fn() } }) },
  };
  const scoped = scopePortablePluginModules(
    modules,
    { minAppVersion: "1.0.0", required: ["sourceEditor"], optional: ["runtimeStyles"] },
    ["sourceEditor"]
  );
  const sdk = scoped["@tau/plugins"] as (typeof modules)["@tau/plugins"];
  expect(sdk.useSourceBlock().compiler).toBeUndefined();
  sdk.useSourceBlock().update();
  expect(update).toHaveBeenCalledOnce();
});

it("服务按插件声明隔离，未声明访问报错，不影响其他插件", () => {
  const compiler = { compile: vi.fn() };
  const modules = { "@tau/plugins": { useSourceBlock: () => ({ compiler }) } };
  const bind = (required: string[]) =>
    scopePortablePluginModules(modules, { minAppVersion: "1.0.0", required, optional: [] }, [
      "sourceEditor",
      "runtimeStyles",
    ])["@tau/plugins"] as (typeof modules)["@tau/plugins"];
  expect(() => bind([]).useSourceBlock()).toThrow("sourceEditor");
  expect(() => bind(["sourceEditor"]).useSourceBlock().compiler).toThrow("runtimeStyles");
  expect(bind(["sourceEditor", "runtimeStyles"]).useSourceBlock().compiler).toBe(compiler);
});

it("已声明必需编译器但编辑器漏接时明确报错", () => {
  const modules = { "@tau/plugins": { useSourceBlock: () => ({ compiler: undefined }) } };
  const scoped = scopePortablePluginModules(
    modules,
    { minAppVersion: "1.0.0", required: ["sourceEditor", "runtimeStyles"], optional: [] },
    ["sourceEditor", "runtimeStyles"]
  );
  const sdk = scoped["@tau/plugins"] as (typeof modules)["@tau/plugins"];
  expect(() => sdk.useSourceBlock().compiler).toThrow("未提供必需");
});
