import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(mobileRoot, "../..");
const appleRoot = path.join(mobileRoot, "src-tauri/gen/apple");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    "用法：pnpm ios:install [--device <设备标识或 UDID>]\n连接并解锁 iPhone 后运行，构建 Release、覆盖安装并启动；多台设备时须指定 --device。"
  );
  process.exit(0);
}
if (args.length && (args.length !== 2 || args[0] !== "--device" || !args[1])) {
  console.error("参数无效，请运行 pnpm ios:install --help。");
  process.exit(1);
}

let child;
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    interrupted = true;
    // 构建进程树退出后才能恢复工程，避免子进程继续写入。
    if (child) process.kill(-child.pid, "SIGTERM");
  });
}

function capture(command, parameters) {
  if (interrupted) throw new Error("操作已中断");
  return execFileSync(command, parameters, { cwd: mobileRoot, encoding: "utf8" });
}

async function run(command, parameters, logPath) {
  if (interrupted) throw new Error("操作已中断");
  console.log(`\n运行：${command} ${parameters.join(" ")}`);
  const log = logPath ? fs.openSync(logPath, "a") : undefined;
  try {
    await new Promise((resolve, reject) => {
      child = spawn(command, parameters, {
        cwd: mobileRoot,
        detached: true,
        stdio: log === undefined ? "inherit" : ["inherit", "pipe", "pipe"],
      });
      if (log !== undefined) {
        for (const [stream, output] of [
          [child.stdout, process.stdout],
          [child.stderr, process.stderr],
        ]) {
          stream.on("data", chunk => {
            fs.writeSync(log, chunk);
            output.write(chunk);
          });
        }
      }
      child.on("error", reject);
      child.on("close", (code, signal) => {
        if (code === 0 && !interrupted) resolve();
        else
          reject(
            new Error(
              `${command} 失败（${signal ?? code}），${logPath ? `日志：${logPath}` : "请查看上方输出"}`
            )
          );
      });
    });
  } finally {
    child = undefined;
    if (log !== undefined) fs.closeSync(log);
  }
}

function plist(file) {
  return JSON.parse(capture("plutil", ["-convert", "json", "-o", "-", file]));
}

async function main() {
  if (process.platform !== "darwin") throw new Error("iPhone 打包安装需要 macOS 与完整 Xcode。");
  capture("xcodebuild", ["-version"]);
  const config = JSON.parse(
    fs.readFileSync(path.join(mobileRoot, "src-tauri/tauri.conf.json"), "utf8")
  );
  const projectFile = path.join(appleRoot, `${config.productName}.xcodeproj/project.pbxproj`);
  if (!fs.existsSync(projectFile))
    throw new Error("iOS 工程不存在，请先在 apps/mobile 执行 pnpm exec tauri ios init。");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "tau-ios-install-"));
  const lock = path.join(appleRoot, ".ios-release-install.lock");
  let locked = false;
  let originalProject;
  try {
    const devicesFile = path.join(temporary, "devices.json");
    await run("xcrun", ["devicectl", "list", "devices", "--json-output", devicesFile]);
    const devices = JSON.parse(fs.readFileSync(devicesFile, "utf8")).result.devices.filter(
      device =>
        device.hardwareProperties?.deviceType === "iPhone" &&
        device.connectionProperties?.transportType === "wired" &&
        device.connectionProperties?.pairingState === "paired"
    );
    const matches = args[1]
      ? devices.filter(device =>
          [device.identifier, device.hardwareProperties.udid].includes(args[1])
        )
      : devices;
    if (matches.length !== 1) {
      throw new Error(
        `需要一台已配对、通过数据线连接的 iPhone；请连接、解锁并信任电脑。多台时使用 --device 指定：\n${devices.map(device => `${device.deviceProperties.name}: ${device.identifier}`).join("\n")}`
      );
    }
    const device = matches[0];
    const detailsFile = path.join(temporary, "details.json");
    await run("xcrun", [
      "devicectl",
      "device",
      "info",
      "details",
      "--device",
      device.identifier,
      "--json-output",
      detailsFile,
    ]);
    const details = JSON.parse(fs.readFileSync(detailsFile, "utf8")).result;
    if (details.deviceProperties?.developerModeStatus !== "enabled") {
      throw new Error("请先在 iPhone 设置 → 隐私与安全性中启用开发者模式，重启确认后重试。");
    }
    try {
      fs.mkdirSync(lock);
      locked = true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      throw new Error(
        `已有安装任务或遗留锁：${lock}。确认其他构建已退出；若有 project.pbxproj.before，先恢复工程，再移除锁目录重试。`
      );
    }
    const output = path.join(
      repositoryRoot,
      "output",
      `ios-device-${config.version}-build${config.bundle.iOS.bundleVersion}`,
      path.basename(temporary)
    );
    fs.mkdirSync(output, { recursive: true });
    console.log(
      `\n目标：${device.deviceProperties.name}，Release ${config.version}（${config.bundle.iOS.bundleVersion}）\n产物：${output}`
    );
    await run("pnpm", ["run", "check:rust"], path.join(output, "checks.log"));
    await run("pnpm", ["run", "sync:ios:icons"], path.join(output, "checks.log"));

    const project = plist(projectFile);
    const target = Object.values(project.objects).find(
      object =>
        object.isa === "PBXNativeTarget" &&
        object.productType === "com.apple.product-type.application"
    );
    const configurations =
      project.objects[target?.buildConfigurationList]?.buildConfigurations ?? [];
    const release = configurations.filter(
      id => project.objects[id].name.toLowerCase() === "release"
    );
    if (release.length !== 1)
      throw new Error("无法唯一定位应用的 release 签名配置，停止修改工程。");
    originalProject = fs.readFileSync(projectFile);
    fs.writeFileSync(path.join(lock, "project.pbxproj.before"), originalProject);
    const pattern = new RegExp(
      `(${release[0]} /\\* release \\*/ = \\{[\\s\\S]*?buildSettings = \\{)([\\s\\S]*?)(\\n\\t\\t\\t\\};)`,
      "i"
    );
    const source = originalProject.toString();
    if (!pattern.test(source)) throw new Error("无法识别 release 工程结构，停止修改签名。");
    const signedProject = source.replace(pattern, (_, prefix, settings, suffix) => {
      const cleaned = settings.replace(
        /^.*\b(?:CODE_SIGN_IDENTITY|CODE_SIGN_STYLE|PROVISIONING_PROFILE(?:_SPECIFIER)?|DEVELOPMENT_TEAM)\b.*=.*;\n?/gm,
        ""
      );
      return `${prefix}${cleaned}\n\t\t\t\tCODE_SIGN_IDENTITY = "Apple Development";\n\t\t\t\tCODE_SIGN_STYLE = Automatic;\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "";\n\t\t\t\tDEVELOPMENT_TEAM = ${JSON.stringify(config.bundle.iOS.developmentTeam)};${suffix}`;
    });
    fs.writeFileSync(projectFile, signedProject);
    try {
      // archive-only 保留内嵌前端的 Release，签名仅用于连接的设备安装。
      await run(
        "pnpm",
        ["exec", "tauri", "ios", "build", "--target", "aarch64", "--archive-only", "--ci"],
        path.join(output, "build.log")
      );
    } finally {
      fs.writeFileSync(projectFile, originalProject);
      originalProject = undefined;
    }
    const archive = path.join(appleRoot, "build", `${config.productName}_iOS.xcarchive`);
    const savedArchive = path.join(output, `${config.productName}_iOS.xcarchive`);
    await run("ditto", [archive, savedArchive]);
    const app = path.join(savedArchive, "Products/Applications", `${config.productName}.app`);
    await run("codesign", ["--verify", "--deep", "--strict", app]);
    const info = plist(path.join(app, "Info.plist"));
    capture("lipo", [path.join(app, info.CFBundleExecutable), "-verify_arch", "arm64"]);
    if (
      info.CFBundleIdentifier !== config.identifier ||
      info.CFBundleShortVersionString !== config.version ||
      info.CFBundleVersion !== config.bundle.iOS.bundleVersion
    ) {
      throw new Error("归档的应用标识或版本与配置不符，停止安装。");
    }
    const profileFile = path.join(temporary, "profile.plist");
    fs.writeFileSync(
      profileFile,
      capture("security", ["cms", "-D", "-i", path.join(app, "embedded.mobileprovision")])
    );
    const profile = {
      ProvisionedDevices: JSON.parse(
        capture("plutil", ["-extract", "ProvisionedDevices", "json", "-o", "-", profileFile])
      ),
      TeamIdentifier: JSON.parse(
        capture("plutil", ["-extract", "TeamIdentifier", "json", "-o", "-", profileFile])
      ),
      ExpirationDate: capture("plutil", ["-extract", "ExpirationDate", "raw", profileFile]).trim(),
    };
    if (
      !profile.ProvisionedDevices?.includes(device.hardwareProperties.udid) ||
      !profile.TeamIdentifier?.includes(config.bundle.iOS.developmentTeam) ||
      new Date(profile.ExpirationDate) <= new Date()
    ) {
      throw new Error(
        "描述文件未包含目标设备、团队不匹配或已过期，停止安装。请在 Xcode 检查自动开发签名。"
      );
    }
    const payload = path.join(temporary, "Payload");
    fs.mkdirSync(payload);
    await run("ditto", [app, path.join(payload, `${config.productName}.app`)]);
    const ipa = path.join(
      output,
      `${config.productName}-${config.version}-build${config.bundle.iOS.bundleVersion}-device.ipa`
    );
    await run("ditto", ["-c", "-k", "--keepParent", payload, ipa]);
    const verification = {
      version: info.CFBundleShortVersionString,
      build: info.CFBundleVersion,
      bundleIdentifier: info.CFBundleIdentifier,
      configuration: "release",
      architecture: "arm64",
      signing: "Apple Development",
      sourceCommit: capture("git", ["rev-parse", "HEAD"]).trim(),
      sha256: capture("shasum", ["-a", "256", ipa]).split(" ")[0],
      installed: false,
      launched: false,
    };
    const report = path.join(output, "verification.json");
    const saveReport = () => fs.writeFileSync(report, `${JSON.stringify(verification, null, 2)}\n`);
    saveReport();
    await run(
      "xcrun",
      ["devicectl", "device", "install", "app", "--device", device.identifier, app],
      path.join(output, "install.log")
    );
    const installedFile = path.join(temporary, "installed.json");
    await run("xcrun", [
      "devicectl",
      "device",
      "info",
      "apps",
      "--device",
      device.identifier,
      "--filter",
      `bundleIdentifier == "${config.identifier}"`,
      "--json-output",
      installedFile,
    ]);
    const installed = JSON.parse(fs.readFileSync(installedFile, "utf8")).result.apps;
    if (
      !installed.some(
        app =>
          app.bundleIdentifier === config.identifier &&
          app.version === config.version &&
          app.bundleVersion === config.bundle.iOS.bundleVersion
      )
    ) {
      throw new Error("安装命令已完成，但设备上的版本核对失败，请查看设备应用信息。");
    }
    verification.installed = true;
    saveReport();
    await run(
      "xcrun",
      [
        "devicectl",
        "device",
        "process",
        "launch",
        "--device",
        device.identifier,
        config.identifier,
      ],
      path.join(output, "install.log")
    );
    verification.launched = true;
    saveReport();
    console.log(
      `\n完成：已覆盖安装并启动 ${config.productName} ${config.version}（${info.CFBundleVersion}）。\n安装包：${ipa}\n核验报告：${report}`
    );
  } finally {
    if (originalProject) fs.writeFileSync(projectFile, originalProject);
    if (locked) fs.rmSync(lock, { recursive: true, force: true });
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
