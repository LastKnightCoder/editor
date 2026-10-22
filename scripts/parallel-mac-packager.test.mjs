import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "node:zlib";
import { createPlatformPackagerFactory } from "../apps/desktop/scripts/parallel-mac-packager.mjs";
import { assertReleaseArtifacts } from "./release-artifacts.mjs";

const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const builderRequire = createRequire(require.resolve("electron-builder"));
const builder = builderRequire("app-builder-lib");
const { Arch, Platform, PlatformPackager } = builder;
const { AsyncTaskManager } = builderRequire("builder-util");
const { computeArchToTargetNamesMap } = builderRequire("app-builder-lib/out/targets/targetFactory");
const { createUpdateInfoTasks, writeUpdateInfoFiles } = builderRequire(
  "app-builder-lib/out/publish/updateInfoBuilder"
);
const { createBlockmap } = builderRequire(
  "app-builder-lib/out/targets/differentialUpdateInfoBuilder"
);
const { parse } = require("yaml");
const AdmZip = require("adm-zip");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fixture({ archs = [Arch.x64, Arch.arm64], mac = {}, prepackaged = null } = {}) {
  const events = [];
  const gates = new Map(archs.map(arch => [arch, deferred()]));
  const submitted = deferred();
  const packaged = [];
  const info = {
    options: {
      targets: new Map([[Platform.MAC, new Map(archs.map(arch => [arch, []]))]]),
      prepackaged,
    },
    config: { mac },
    cancellationToken: new builder.CancellationToken(),
  };

  const notarize = async ({ appPath }) => {
    const arch = path.basename(path.dirname(appPath));
    events.push(`submit:${arch}`);
    if (events.filter(event => event.startsWith("submit:")).length === archs.length) {
      submitted.resolve();
    }
    await gates.get(Arch[arch]).promise;
    events.push(`staple:${arch}`);
  };

  class MacPackager {
    constructor(info) {
      this.info = info;
      this.platformSpecificBuildOptions = info.config.mac;
      this.defaultTarget = ["dmg", "zip"];
    }

    async pack(outDir, arch, targets, taskManager) {
      events.push(`sign:${Arch[arch]}`);
      await info.sign?.(arch);
      if (info.cancellationToken.cancelled) return;
      const appPath = path.join(outDir, Arch[arch], "Tau.app");
      if (!info.unsigned) await this.notarizeIfProvided(appPath);
      this.packageInDistributableFormat(appPath, arch, targets, taskManager);
    }

    async notarizeIfProvided(appPath) {
      return notarize({ appPath });
    }

    getNotarizeOptions(appPath) {
      return info.missingCredentials ? undefined : { appPath, keychainProfile: "fixture" };
    }

    packageInDistributableFormat(...args) {
      events.push(`artifact:${Arch[args[1]]}`);
      packaged.push(args);
      PlatformPackager.prototype.packageInDistributableFormat.call(this, ...args);
    }
  }

  const factory = createPlatformPackagerFactory(
    { ...builder, MacPackager },
    computeArchToTargetNamesMap,
    notarize
  );
  const packager = factory(info, Platform.MAC);
  const manager = new AsyncTaskManager(info.cancellationToken);
  return { packager, info, events, gates, submitted, packaged, manager, factory };
}

test("并发调用仍顺序签名；两份公证同时在途，全部附票后才生成产物", async () => {
  const f = fixture();
  const signing = deferred();
  f.info.sign = arch => (arch === Arch.x64 ? signing.promise : undefined);
  const x64Targets = [];
  const armTargets = [];
  const first = f.packager.pack("release", Arch.x64, x64Targets, f.manager);
  const second = f.packager.pack("release", Arch.arm64, armTargets, f.manager);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.events, ["sign:x64"]);
  signing.resolve();
  await f.submitted.promise;
  assert.deepEqual(f.events, ["sign:x64", "sign:arm64", "submit:x64", "submit:arm64"]);
  f.gates.get(Arch.x64).resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.packaged.length, 0);
  f.gates.get(Arch.arm64).resolve();
  await Promise.all([first, second]);
  assert.deepEqual(f.events.slice(-4), [
    "staple:x64",
    "staple:arm64",
    "artifact:x64",
    "artifact:arm64",
  ]);
  assert.equal(f.packaged[0][2], x64Targets);
  assert.equal(f.packaged[1][2], armTargets);
  assert.ok(f.packaged.every(args => args[3] === f.manager));
});

test("任一公证失败仍收齐另一项结果，不生成半套产物", async () => {
  const f = fixture();
  await f.packager.pack("release", Arch.x64, [], f.manager);
  let finished = false;
  const pending = f.packager.pack("release", Arch.arm64, [], f.manager);
  const checked = assert
    .rejects(pending, error => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.errors[0].message, /Invalid/);
      return true;
    })
    .then(() => {
      finished = true;
    });
  await f.submitted.promise;
  f.gates.get(Arch.x64).reject(new Error("Invalid: 原生程序签名无效"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  f.gates.get(Arch.arm64).resolve();
  await checked;
  assert.equal(f.packaged.length, 0);
});

test("第二架构签名失败时不提交公证，也不生成第一架构安装包", async () => {
  const f = fixture();
  f.info.sign = arch => {
    if (arch === Arch.arm64) throw new Error("签名失败");
  };
  await f.packager.pack("release", Arch.x64, [], f.manager);
  await assert.rejects(f.packager.pack("release", Arch.arm64, [], f.manager), /签名失败/);
  assert.deepEqual(f.events, ["sign:x64", "sign:arm64"]);
  assert.equal(f.packaged.length, 0);
});

test("缺少公证凭据时立即失败，不把跳过当成功，也不继续构建第二架构", async () => {
  const f = fixture();
  f.info.missingCredentials = true;
  await assert.rejects(
    f.packager.pack("release", Arch.x64, [], f.manager),
    /缺少 macOS 公证凭据.*APPLE_KEYCHAIN_PROFILE/
  );
  assert.deepEqual(f.events, ["sign:x64"]);
  assert.equal(f.packaged.length, 0);
});

test("缺少签名时不能以零项公证成功继续生成发行产物", async () => {
  const f = fixture();
  f.info.unsigned = true;
  await f.packager.pack("release", Arch.x64, [], f.manager);
  await assert.rejects(
    f.packager.pack("release", Arch.arm64, [], f.manager),
    /应用缺少签名或公证任务/
  );
  assert.deepEqual(f.events, ["sign:x64", "sign:arm64"]);
  assert.equal(f.packaged.length, 0);
});

test("公证等待中取消构建，完成后不生成安装包与更新清单", async () => {
  const f = fixture();
  await f.packager.pack("release", Arch.x64, [], f.manager);
  const pending = f.packager.pack("release", Arch.arm64, [], f.manager);
  await f.submitted.promise;
  f.info.cancellationToken.cancel();
  f.gates.forEach(gate => gate.resolve());
  await pending;
  assert.equal(f.packaged.length, 0);
});

test("单架构、关闭公证、MAS 与预打包模式沿用原调度", async () => {
  for (const options of [
    { archs: [Arch.arm64] },
    { mac: { notarize: false } },
    { mac: { target: [{ target: "mas", arch: ["x64", "arm64"] }] } },
    { prepackaged: "existing/Tau.app" },
  ]) {
    const f = fixture(options);
    f.gates.forEach(gate => gate.resolve());
    const arch = options.archs?.[0] ?? Arch.x64;
    await f.packager.pack("release", arch, [], f.manager);
    assert.deepEqual(f.events, [
      `sign:${Arch[arch]}`,
      `submit:${Arch[arch]}`,
      `staple:${Arch[arch]}`,
      `artifact:${Arch[arch]}`,
    ]);
  }
});

test("Windows 和 Linux 使用原生 packager", () => {
  class WinPackager {
    constructor(info) {
      this.info = info;
    }
  }
  class LinuxPackager extends WinPackager {}
  const factory = createPlatformPackagerFactory(
    { ...builder, WinPackager, LinuxPackager },
    computeArchToTargetNamesMap
  );
  const info = {};
  assert.equal(factory(info, Platform.WINDOWS).constructor, WinPackager);
  assert.equal(factory(info, Platform.LINUX).constructor, LinuxPackager);
});

test("原生 target 调度和更新生成器保留双架构四件套、大小、摘要及 blockmap 信息", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tau-notarized-release-"));
  try {
    const f = fixture({ mac: { releaseInfo: { releaseNotes: "测试发布" } } });
    const publish = { provider: "generic", url: "https://dl.taunote.app/desktop" };
    const tasks = [];
    const files = [];
    f.info.emitArtifactBuildCompleted = async () => {};
    Object.assign(f.packager, {
      appInfo: { version: "0.59.0" },
      platform: Platform.MAC,
      config: f.info.config,
    });
    const targets = ["dmg", "zip"].map(ext => ({
      outDir: dir,
      isAsyncSupported: true,
      async build(appPath, arch) {
        assert.ok(f.events.includes(`staple:${Arch[arch]}`));
        const name = `Tau-v0.59.0-darwin-${Arch[arch]}.${ext}`;
        const file = path.join(dir, name);
        await writeFile(file, `${appPath}:stapled`);
        const updateInfo = await createBlockmap(file, this, f.packager, name);
        files.push(name);
        tasks.push(
          ...(await createUpdateInfoTasks(
            {
              file,
              arch,
              updateInfo,
              target: this,
              packager: f.packager,
            },
            [publish]
          ))
        );
      },
    }));
    await f.packager.pack(dir, Arch.x64, targets, f.manager);
    const pending = f.packager.pack(dir, Arch.arm64, targets, f.manager);
    await f.submitted.promise;
    assert.equal(files.length, 0);
    f.gates.forEach(gate => gate.resolve());
    await pending;
    await f.manager.awaitTasks();
    await writeUpdateInfoFiles(tasks, { async emitArtifactCreated() {} });
    assertReleaseArtifacts(dir, "0.59.0", files, ["latest-mac.yml"]);
    const feed = parse(await readFile(path.join(dir, "latest-mac.yml"), "utf8"));
    assert.equal(feed.files.length, 4);
    assert.ok(feed.path.endsWith(".zip"));
    for (const file of feed.files) {
      const bytes = await readFile(path.join(dir, file.url));
      assert.equal(file.sha512, createHash("sha512").update(bytes).digest("base64"));
      assert.equal(file.size, bytes.length);
      const blockmap = await readFile(path.join(dir, `${file.url}.blockmap`));
      assert.ok(JSON.parse(unzipSync(blockmap)).files.length > 0);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  "真实 electron-builder 构建在附票后生成双架构 ZIP、内置更新源及合并清单",
  {
    skip: process.platform !== "darwin",
  },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tau-mac-builder-"));
    const events = [];
    const bothSubmitted = deferred();
    try {
      await writeFile(
        path.join(dir, "package.json"),
        JSON.stringify({
          name: "tau-packaging-fixture",
          version: "0.59.0",
          description: "打包流程回归夹具",
          author: "Tau",
          devDependencies: { electron: "43.1.1" },
        })
      );
      const original = parse(
        await readFile(new URL("../apps/desktop/electron-builder.yml", import.meta.url), "utf8")
      );
      class FixtureMacPackager extends builder.MacPackager {
        async doPack(context) {
          const app = path.join(context.appOutDir, "Tau.app");
          await mkdir(path.join(app, "Contents", "Resources"), { recursive: true });
          await writeFile(path.join(app, "Contents", "payload"), Arch[context.arch]);
          await this.info.emitAfterPack({
            ...context,
            packager: this,
            electronPlatformName: "darwin",
          });
          events.push(`sign:${Arch[context.arch]}`);
          await this.notarizeIfProvided(app);
        }

        getNotarizeOptions(appPath) {
          return { appPath, keychainProfile: "fixture" };
        }
      }
      const options = {
        projectDir: dir,
        publish: "never",
        targets: Platform.MAC.createTarget([], Arch.x64, Arch.arm64),
        config: {
          appId: original.appId,
          productName: original.productName,
          directories: { output: "release" },
          mac: {
            artifactName: original.mac.artifactName,
            target: [{ target: "zip", arch: ["x64", "arm64"] }],
          },
          publish: original.publish,
          artifactBuildStarted: async event => {
            assert.equal(events.filter(event => event.startsWith("submit:")).length, 2);
            for (const output of ["mac", "mac-arm64"]) {
              assert.equal(
                await readFile(
                  path.join(dir, "release", output, "Tau.app", "Contents", "notary-ticket"),
                  "utf8"
                ),
                "公证票据夹具"
              );
            }
          },
        },
        platformPackagerFactory: createPlatformPackagerFactory(
          { ...builder, MacPackager: FixtureMacPackager },
          computeArchToTargetNamesMap,
          async ({ appPath: app }) => {
            assert.equal(events.filter(event => event.startsWith("sign:")).length, 2);
            events.push(`submit:${app}`);
            if (events.filter(event => event.startsWith("submit:")).length === 2)
              bothSubmitted.resolve();
            await bothSubmitted.promise;
            await writeFile(path.join(app, "Contents", "notary-ticket"), "公证票据夹具");
          }
        ),
      };
      await builder.build(options);
      assert.deepEqual(events.slice(0, 2), ["sign:x64", "sign:arm64"]);
      const releaseDir = path.join(dir, "release");
      const feed = parse(await readFile(path.join(releaseDir, "latest-mac.yml"), "utf8"));
      assert.equal(feed.files.length, 2);
      for (const arch of ["x64", "arm64"]) {
        const name = `Tau-v0.59.0-darwin-${arch}.zip`;
        const file = feed.files.find(file => file.url === name);
        assert.ok(file);
        const bytes = await readFile(path.join(releaseDir, name));
        assert.equal(file.sha512, createHash("sha512").update(bytes).digest("base64"));
        assert.equal(file.size, bytes.length);
        const zip = new AdmZip(bytes);
        assert.equal(zip.readAsText("Tau.app/Contents/notary-ticket"), "公证票据夹具");
        const update = parse(zip.readAsText("Tau.app/Contents/Resources/app-update.yml"));
        assert.equal(update.provider, original.publish[0].provider);
        assert.equal(update.url, original.publish[0].url);
        assert.ok(
          JSON.parse(unzipSync(await readFile(path.join(releaseDir, `${name}.blockmap`)))).files
            .length > 0
        );
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);
