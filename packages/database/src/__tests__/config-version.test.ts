import { describe, expect, it, vi } from "vitest";
import {
  defineFieldModel,
  upgradeColumnConfig,
  upgradeColumns,
  type DatabaseFieldModel,
} from "../model";
import type { ColumnDef } from "../types";

const column = (type: string, config?: unknown, configVersion?: number): ColumnDef => ({
  id: "col",
  title: "列",
  type,
  config,
  ...(configVersion === undefined ? {} : { configVersion }),
});

describe("defineFieldModel 配置版本", () => {
  it("configVersion > 1 却没有 migrateConfig 视为定义错误，抛错", () => {
    expect(() => defineFieldModel({ type: "x", toText: () => "", configVersion: 2 })).toThrow(
      /migrateConfig/
    );
  });

  it("版本为 1 或未声明时不要求 migrateConfig", () => {
    expect(() => defineFieldModel({ type: "x", toText: () => "" })).not.toThrow();
    expect(() => defineFieldModel({ type: "x", toText: () => "", configVersion: 1 })).not.toThrow();
    expect(() =>
      defineFieldModel({ type: "x", toText: () => "", configVersion: 2, migrateConfig: c => c })
    ).not.toThrow();
  });
});

describe("upgradeColumnConfig", () => {
  it("逐级迁移：1 → 3 调两次 migrateConfig 并带上最终版本", () => {
    const calls: number[] = [];
    const model = defineFieldModel({
      type: "x",
      toText: () => "",
      configVersion: 3,
      migrateConfig: (config, fromVersion) => {
        calls.push(fromVersion);
        return { ...(config as object), v: fromVersion + 1 };
      },
    });
    const upgraded = upgradeColumnConfig(column("x", { v: 1 }), model);
    expect(calls).toEqual([1, 2]);
    expect(upgraded.config).toEqual({ v: 3 });
    expect(upgraded.configVersion).toBe(3);
  });

  it("版本相等时原样返回（引用相等）", () => {
    const model = defineFieldModel({
      type: "x",
      toText: () => "",
      configVersion: 2,
      migrateConfig: c => c,
    });
    const source = column("x", { a: 1 }, 2);
    expect(upgradeColumnConfig(source, model)).toBe(source);
  });

  it("列版本高于 model 版本时不降级、不改动", () => {
    const model = defineFieldModel({
      type: "x",
      toText: () => "",
      configVersion: 2,
      migrateConfig: vi.fn(() => ({ downgraded: true })),
    });
    const source = column("x", { newer: true }, 5);
    const upgraded = upgradeColumnConfig(source, model);
    expect(upgraded).toBe(source);
    expect(upgraded.config).toEqual({ newer: true });
    expect(upgraded.configVersion).toBe(5);
    expect(model.migrateConfig).not.toHaveBeenCalled();
  });

  it("model 未声明版本（视为 1）或 model 缺失时原样返回", () => {
    const plain = defineFieldModel({ type: "x", toText: () => "" });
    const source = column("x", { a: 1 });
    expect(upgradeColumnConfig(source, plain)).toBe(source);
    expect(upgradeColumnConfig(source, undefined)).toBe(source);
  });

  it("configVersion 缺省视为 1：无版本列会被迁移", () => {
    const model = defineFieldModel({
      type: "x",
      toText: () => "",
      configVersion: 2,
      migrateConfig: config => ({ ...(config as object), migrated: true }),
    });
    const upgraded = upgradeColumnConfig(column("x", { a: 1 }), model);
    expect(upgraded.config).toEqual({ a: 1, migrated: true });
    expect(upgraded.configVersion).toBe(2);
  });
});

describe("upgradeColumns", () => {
  const modelA = defineFieldModel({
    type: "a",
    toText: () => "",
    configVersion: 2,
    migrateConfig: config => ({ ...(config as object), v2: true }),
  });
  const models: readonly DatabaseFieldModel[] = [modelA];

  it("按各自字段 model 升级，未涉及列保持引用", () => {
    const untouched = column("b", { b: 1 });
    const stale = column("a", { a: 1 });
    const next = upgradeColumns([untouched, stale], models);
    expect(next[0]).toBe(untouched);
    expect(next[1].config).toEqual({ a: 1, v2: true });
    expect(next[1].configVersion).toBe(2);
  });

  it("无任何列变化时返回原数组（引用相等）", () => {
    const columns = [column("b", { b: 1 }), column("a", { a: 1 }, 2)];
    expect(upgradeColumns(columns, models)).toBe(columns);
  });

  it("没有对应 model 的列原样保留", () => {
    const columns = [column("ghost", { g: 1 })];
    expect(upgradeColumns(columns, models)).toBe(columns);
  });
});
