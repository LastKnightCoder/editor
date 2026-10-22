// 通过 electron-builder 的工厂扩展调度，产物与更新信息仍由原有 target 生成。
export function createPlatformPackagerFactory(builder, computeArchToTargetNamesMap, notarize) {
  const { Arch, Platform, MacPackager, WinPackager, LinuxPackager } = builder;

  class ParallelNotarizationMacPackager extends MacPackager {
    constructor(info) {
      super(info);
      const targets = computeArchToTargetNamesMap(
        info.options.targets.get(Platform.MAC),
        this,
        Platform.MAC
      );
      this.remainingArchs = new Set(targets.keys());
      this.deferNotarization =
        !info.options.prepackaged &&
        this.platformSpecificBuildOptions.notarize !== false &&
        targets.size === 2 &&
        targets.has(Arch.x64) &&
        targets.has(Arch.arm64) &&
        ![...targets.values()].flat().some(name => /^mas(?:-dev)?$/i.test(name.trim()));
      this.notarizationApps = new Map();
      this.distributions = [];
      this.packQueue = Promise.resolve();
    }

    pack(...args) {
      if (!this.deferNotarization) {
        return super.pack(...args);
      }
      // 原生依赖会原地重编，即使外部开启 jobs 并发也必须串行构建。
      this.packQueue = this.packQueue.then(() => this.packSequentially(...args));
      return this.packQueue;
    }

    async packSequentially(outDir, arch, targets, taskManager) {
      console.log(`[mac-build] 构建并签名 ${Arch[arch]}`);
      await super.pack(outDir, arch, targets, taskManager);
      this.remainingArchs.delete(arch);
      if (this.remainingArchs.size > 0 || this.info.cancellationToken.cancelled) {
        return;
      }

      for (const [appPath] of this.distributions) {
        if (!this.notarizationApps.has(appPath)) {
          throw new Error(`应用缺少签名或公证任务，停止生成发行产物：${appPath}`);
        }
      }

      const results = await Promise.allSettled(
        [...this.notarizationApps].map(async ([appPath, options]) => {
          console.log(`[mac-notarize] 提交并等待公证：${appPath}`);
          await notarize(options);
          console.log(`[mac-notarize] 公证通过并已附加票据：${appPath}`);
        })
      );
      const failures = results.filter(result => result.status === "rejected");
      if (failures.length > 0) {
        throw new AggregateError(
          failures.map(result => result.reason),
          "macOS 公证失败，本轮安装包和更新清单未生成"
        );
      }
      if (this.info.cancellationToken.cancelled) {
        return;
      }

      console.log("[mac-build] 公证全部通过并已附票，开始生成安装包和自动更新产物");
      for (const args of this.distributions) {
        super.packageInDistributableFormat(...args);
      }
    }

    async notarizeIfProvided(appPath) {
      if (!this.deferNotarization) {
        return super.notarizeIfProvided(appPath);
      }
      const options = this.getNotarizeOptions(appPath);
      if (!options) {
        throw new Error(
          '缺少 macOS 公证凭据，尚未提交公证，停止生成发行产物。请在当前终端执行 export APPLE_KEYCHAIN_PROFILE="tau-notary"，或配置 electron-builder 支持的其他公证凭据后重试。'
        );
      }
      // 固定已校验的凭据，直接执行公证库，避免其可选入口把跳过当作成功返回。
      this.notarizationApps.set(appPath, options);
    }

    packageInDistributableFormat(...args) {
      if (!this.deferNotarization) {
        return super.packageInDistributableFormat(...args);
      }
      // 票据附加前不能压缩或计算摘要，否则安装包与更新校验值会失配。
      this.distributions.push(args);
    }
  }

  return (info, platform) => {
    if (platform === Platform.MAC) {
      return new ParallelNotarizationMacPackager(info);
    }
    if (platform === Platform.WINDOWS) {
      return new WinPackager(info);
    }
    if (platform === Platform.LINUX) {
      return new LinuxPackager(info);
    }
    throw new Error(`不支持的打包平台：${platform}`);
  };
}
