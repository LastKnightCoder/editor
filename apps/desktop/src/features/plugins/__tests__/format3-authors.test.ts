import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { evaluatePortablePluginPackage } from "@tau/plugins/rendering";
import { validatePortableDistributionManifest } from "@tau/plugins/portable";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import { desktopPortableHost } from "../../../../shared/plugin-package";

const reportPath = process.env.TAU_FORMAT3_AUTHORS_REPORT;

it.runIf(reportPath)("十个真实格式 3 包保留桌面贡献并在移动求值前拒绝", () => {
  // 原生进程读取 ZIP，渲染测试只消费文本，避免 JSDOM 与 Node 字节数组的跨域差异。
  const entries = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "-e",
        `
    const fs=require('node:fs'),crypto=require('node:crypto'),AdmZip=require('adm-zip');
    const report=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
    const entries=report.results.filter(item=>item.name!=='tau-plugin-template').map(item=>{
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
  expect(entries).toHaveLength(10);
  for (const entry of entries) {
    expect(entry.status).toBe("passed");
    const manifest = validatePortableDistributionManifest(entry.manifest);
    expect(Object.keys(manifest.targets)).toEqual(["desktop"]);
    const artifact = { manifest, code: entry.code };
    const host = desktopPortableHost("0.59.3");
    const definition = evaluatePortablePluginPackage(artifact, sharedPluginModules, host);
    expect(definition.id).toBe(manifest.id);
    if (manifest.whiteboard) expect(definition.whiteboardExtensions?.length).toBeGreaterThan(0);
    for (const platform of ["android", "ios"] as const)
      expect(() =>
        evaluatePortablePluginPackage(artifact, sharedPluginModules, {
          ...host,
          environment: { ...host.environment, platform },
        })
      ).toThrow("不支持当前平台");
  }
});
