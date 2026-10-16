import { expect, it } from "vitest";
import { comparePluginVersions, assertPluginCompatibility } from "../version";

it("比较正式、预发布和构建元数据，拒绝非法版本", () => {
  const order = [
    "0.58.0-alpha",
    "0.58.0-alpha.1",
    "0.58.0-alpha.2",
    "0.58.0-alpha.10",
    "0.58.0-beta",
    "0.58.0-rc.1",
    "0.58.0",
    "0.58.1",
    "0.59.0",
    "1.0.0",
  ];
  for (let index = 1; index < order.length; index++) {
    expect(comparePluginVersions(order[index - 1], order[index])).toBeLessThan(0);
    expect(comparePluginVersions(order[index], order[index - 1])).toBeGreaterThan(0);
  }
  expect(comparePluginVersions("0.58.0+one", "0.58.0+two")).toBe(0);
  for (const version of ["", "1", "v1.0.0", "01.0.0", "1.0.0-01", ">=1.0.0"])
    expect(() => comparePluginVersions(version, "1.0.0")).toThrow();
});
it("兼容旧包，最低正式版本不能被同号预发布绕过", () => {
  expect(() => assertPluginCompatibility({}, "0.57.2")).not.toThrow();
  expect(() => assertPluginCompatibility({ minAppVersion: "0.58.0" }, "0.58.0")).not.toThrow();
  expect(() => assertPluginCompatibility({ minAppVersion: "0.58.0" }, "0.58.0-rc.1")).toThrow(
    "需要 Tau"
  );
});
