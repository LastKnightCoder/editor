import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { evaluatePortablePluginPackage } from "@tau/plugins/rendering";
import { validatePortableDistributionManifest } from "@tau/plugins/portable";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import { desktopPortableHost } from "../../../../shared/plugin-package";

const reportPath = process.env.TAU_FORMAT3_AUTHORS_REPORT;

it.runIf(reportPath)("全部真实格式 3 包从实际定义装配，按平台与版本检查", () => {
  // 原生进程读取 ZIP，渲染测试只消费文本，避免 JSDOM 与 Node 字节数组的跨域差异。
  const entries = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "-e",
        `
    const fs=require('node:fs'),crypto=require('node:crypto'),AdmZip=require('adm-zip');
    const report=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
    const entries=report.results.map(item=>{
      const zip=new AdmZip(item.archive);
      const file=zip.getEntries().find(file=>file.entryName.endsWith('/manifest.json'));
      const manifest=JSON.parse(zip.readAsText(file.entryName));
      for(const [file,digest] of Object.entries(manifest.integrity))
        if(crypto.createHash('sha256').update(zip.readFile(manifest.id+'/'+file)).digest('hex')!==digest)
          throw Error('ZIP integrity mismatch: '+item.name);
      return {name:item.name,status:item.status,manifest,code:zip.readAsText(manifest.id+'/'+manifest.main)};
    });
    process.stdout.write(JSON.stringify(entries));
  `,
        reportPath!,
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
  ) as {
    name: string;
    status: string;
    manifest: unknown;
    code: string;
  }[];
  expect(entries).toHaveLength(24);
  for (const entry of entries) {
    expect(entry.status).toBe("passed");
    const manifest = validatePortableDistributionManifest(entry.manifest);
    for (const target of Object.values(manifest.targets))
      expect(Object.keys(target)).toEqual(["minAppVersion"]);
    for (const field of ["editor", "whiteboard", "requires", "required", "optional"])
      expect(manifest).not.toHaveProperty(field);
    const artifact = { manifest, code: entry.code };
    const host = desktopPortableHost("0.59.4");
    const definition = evaluatePortablePluginPackage(artifact, sharedPluginModules, host);
    expect(definition.id).toBe(manifest.id);
    if (definition.id === "taunote.stickman")
      expect(definition.whiteboardExtensions).toHaveLength(1);
    for (const platform of ["android", "ios"] as const) {
      const current = {
        ...host,
        appVersion: "0.2.4",
        environment: { ...host.environment, platform },
      };
      if (manifest.targets[platform]) {
        expect(evaluatePortablePluginPackage(artifact, sharedPluginModules, current).id).toBe(
          manifest.id
        );
      } else {
        expect(() => evaluatePortablePluginPackage(artifact, sharedPluginModules, current)).toThrow(
          "不支持当前平台"
        );
      }
    }
  }
});
