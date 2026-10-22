import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webcrypto, createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { SpikeRuntime, verifyArtifacts, downloadArtifacts, PACKAGE_KEY } from "./runtime";
import type { PluginEnvironment } from "@tau/plugins";

const environment: PluginEnvironment = {
  platform: "android",
  layout: "compact",
  input: { touch: true, finePointer: false },
  capabilities: ["pages", "navigation"],
};
const code = `module.exports.default = require('@tau/plugins').definePlugin({id:'spike.counter',name:'计数器',version:'0.1.0',create:()=>({activate(ctx){const page=ctx.pages.register({id:'main',title:'计数',component:()=>null});ctx.navigation.registerEntry({id:'main',title:'计数',page});}})});`;
function fixtures() {
  const root = resolve(process.cwd(), "../../tests/fixtures/plugins/releases/tau.abc/0.1.0");
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
  return [
    {
      manifest: {
        formatVersion: 1,
        apiVersion: 1,
        id: "spike.counter",
        name: "计数器",
        version: "0.1.0",
        platform: "desktop",
        format: "cjs",
        main: "main.js",
        integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
      },
      code,
    },
    {
      manifest,
      code: readFileSync(resolve(root, manifest.main), "utf8"),
      css: readFileSync(resolve(root, manifest.styles), "utf8"),
    },
  ];
}
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("原始 ABC 包通过摘要检查；篡改、重复身份、后台包拒绝执行", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const artifacts = fixtures();
  expect((await verifyArtifacts(artifacts))[1].manifest.id).toBe("tau.abc");
  const altered = structuredClone(artifacts);
  altered[1].code += "修改";
  await expect(verifyArtifacts(altered)).rejects.toThrow("摘要");
  await expect(verifyArtifacts([artifacts[0], artifacts[0]])).rejects.toThrow("范围");
  await expect(
    verifyArtifacts([
      { ...artifacts[0], manifest: { ...artifacts[0].manifest, backend: {} } },
      artifacts[1],
    ])
  ).rejects.toThrow();
});

it("下载校验失败保留已安装快照，成功后可只用本地包恢复", async () => {
  vi.stubGlobal("crypto", webcrypto);
  localStorage.setItem(PACKAGE_KEY, "旧快照");
  const artifacts = fixtures();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response(JSON.stringify([{ ...artifacts[0], code: "被篡改" }, artifacts[1]]))
    )
  );
  await expect(downloadArtifacts()).rejects.toThrow("摘要");
  expect(localStorage.getItem(PACKAGE_KEY)).toBe("旧快照");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(artifacts)))
  );
  await downloadArtifacts();
  const runtime = new SpikeRuntime(environment);
  await runtime.start(await verifyArtifacts(JSON.parse(localStorage.getItem(PACKAGE_KEY)!)));
  expect(runtime.entries.size).toBe(1);
  expect(
    runtime.content.extensions.flatMap(extension =>
      extension.elements?.map(element => element.type)
    )
  ).toContain("abc");
  const entry = [...runtime.entries.values()][0];
  await runtime.dispose();
  expect(runtime.entries.size).toBe(0);
  expect(document.querySelectorAll("style[data-spike-plugin]")).toHaveLength(0);
  await expect(entry.page.open()).rejects.toThrow();
});
