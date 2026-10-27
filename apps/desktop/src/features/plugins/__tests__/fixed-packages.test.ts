import path from "node:path";
import { expect, it } from "vitest";
import { readPluginFixtures } from "../../../../../../scripts/plugins/test-support/package-fixtures";
import { evaluateDesktopPluginPackage } from "../../../../shared/plugin-rendering";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import { version } from "../../../../package.json";

it("固定包全部以当前格式通过摘要检查和正式宿主求值", async () => {
  const fixtures = await readPluginFixtures(
    path.resolve(import.meta.dirname, "../../../../../../tests/fixtures/plugins/catalog.json")
  );
  expect(fixtures.length).toBeGreaterThan(0);
  for (const artifact of fixtures) {
    expect(artifact.manifest.formatVersion, artifact.manifest.id).toBe(3);
    const definition = evaluateDesktopPluginPackage(artifact, sharedPluginModules, version);
    expect(definition.id).toBe(artifact.manifest.id);
    expect(typeof definition.create).toBe("function");
  }
});
