import { createRequire } from "node:module";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("桌面宿主与手机核心使用同一组实际 pi 版本，格式适配不被隐式依赖升级绕过", () => {
  const desktop = createRequire(
    resolve(import.meta.dirname, "../../../../apps/desktop/package.json")
  );
  const shared = createRequire(resolve(import.meta.dirname, "../../package.json"));
  const manifest = (require: ReturnType<typeof createRequire>, name: string) => {
    const file = require.resolve
      .paths(name)
      ?.map(path => resolve(path, name, "package.json"))
      .find(existsSync);
    if (!file) throw new Error(`缺少 SDK 元数据：${name}`);
    return realpathSync(file);
  };
  const version = (require: ReturnType<typeof createRequire>, name: string) =>
    JSON.parse(readFileSync(manifest(require, name), "utf8")).version;
  const expected = version(shared, "@earendil-works/pi-ai");
  expect(version(desktop, "@earendil-works/pi-ai")).toBe(expected);
  expect(version(desktop, "@earendil-works/pi-coding-agent")).toBe(expected);
  expect(version(shared, "@earendil-works/pi-agent-core")).toBe(expected);
  const coding = createRequire(manifest(desktop, "@earendil-works/pi-coding-agent"));
  expect(version(coding, "@earendil-works/pi-agent-core")).toBe(expected);
});
