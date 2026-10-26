import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, it, vi } from "vitest";
import {
  assertProviderForm,
  readProviderFormValues,
  validateProviderFormValues,
  type PluginServices,
} from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { evaluatePortablePluginPackage } from "@tau/plugins/rendering";
import { portableSharedPluginModules } from "@tau/plugins/portable-shared-modules";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";

const reportPath = process.env.TAU_PROVIDER_AUTHORS_REPORT;
it.skipIf(!reportPath)("八个真实发行候选注册配置分区，声明式字段与初始模型完整", async () => {
  const report = JSON.parse(await readFile(reportPath!, "utf8"));
  const environment = createPluginEnvironmentStore({
    platform: "desktop",
    input: { coarsePointer: false, finePointer: true },
  });
  const runtime = new DesktopPluginRuntime({
    workspaceId: "fixture",
    storage: createMemoryStorage(),
    plugins: [],
    navigator: { push: vi.fn() },
    openSettings: vi.fn(),
    environmentSource: environment,
    services: { videoExtractor: { probe: vi.fn() } } as unknown as PluginServices,
  });
  try {
    for (const item of report.results) {
      expect(item.status).toBe("passed");
      const source = JSON.parse(await readFile(path.join(item.author, "manifest.json"), "utf8"));
      const pointer = JSON.parse(
        await readFile(path.join(item.author, "dist", `tau-build-${source.id}.json`), "utf8")
      );
      const directory = path.join(item.author, "dist", pointer.directory);
      const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
      const code = await readFile(path.join(directory, manifest.main), "utf8");
      runtime.host.registerTrusted(
        evaluatePortablePluginPackage({ manifest, code }, portableSharedPluginModules, {
          environment: environment.getSnapshot(),
          appVersion: "0.60.2",
          profiles: ["web-v1"],
        })
      );
      await runtime.host.enable(manifest.id);
    }
    const sections = runtime.listSettings();
    expect(sections).toHaveLength(8);
    expect(sections.filter(item => item.definition.form)).toHaveLength(6);
    for (const { definition } of sections) {
      if (!definition.form) {
        expect(typeof definition.component).toBe("function");
        continue;
      }
      expect(() => assertProviderForm(definition.form!)).not.toThrow();
      const values = readProviderFormValues(definition.form, {
        apiKey: "fixture-key",
        accessKeyId: "fixture",
        secretAccessKey: "fixture",
        bucket: "fixture",
      });
      expect(validateProviderFormValues(definition.form, values)).toEqual({});
      if (definition.form.beforeSave)
        await expect(
          definition.form.beforeSave(values, new AbortController().signal)
        ).resolves.toBeDefined();
      if (["tts", "images", "asr"].includes(definition.target!))
        expect(definition.models?.length).toBeGreaterThan(0);
    }
  } finally {
    await runtime.dispose();
  }
});
