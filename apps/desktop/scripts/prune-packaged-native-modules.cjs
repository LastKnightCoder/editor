const fs = require("node:fs");
const path = require("node:path");

// 各平台允许进包的 llama.cpp 后端，run-electron-builder 的补拉与
// verify-native-runtime 的产物断言均以此为准，防止多处拷贝漂移
const llamaBackendAllowlistByPlatform = {
  win32: ["win-x64", "win-x64-vulkan"],
  darwin: ["mac-arm64-metal", "mac-x64"],
  linux: ["linux-x64", "linux-x64-vulkan"],
};

exports.llamaBackendAllowlistByPlatform = llamaBackendAllowlistByPlatform;

// 带平台 token 的原生模块目录只允许当前平台的 token。electron-builder 在
// pnpm 布局下会顺着虚拟 store 收集 optionalDependencies 里钉住的全平台
// 变体（本机 store 物化了 win32 包时尤甚），prune 依据同一份常量清扫，
// verify-native-runtime 复用它做产物断言，保证两处规则不漂移。
const knownPlatformTokens = [
  "aix",
  "android",
  "arm",
  "arm64",
  "darwin",
  "freebsd",
  "gnu",
  "ia32",
  "linux",
  "metal",
  "msvc",
  "musl",
  "ppc64",
  "riscv64",
  "s390x",
  "sunos",
  "wasm32",
  "win32",
  "windows",
  "x64",
];

const allowedPlatformTokensByPlatform = {
  win32: ["win32", "windows", "x64", "msvc"],
  darwin: ["darwin", "arm64", "x64", "metal"],
  linux: ["linux", "x64", "gnu"],
};

exports.knownPlatformTokens = knownPlatformTokens;
exports.allowedPlatformTokensByPlatform = allowedPlatformTokensByPlatform;

const findForeignPlatformToken = (packageName, platform) => {
  const allowedTokens = allowedPlatformTokensByPlatform[platform];
  if (!allowedTokens) {
    return null;
  }
  const nameWithoutScope = packageName.split("/").pop();
  return (
    knownPlatformTokens.find(
      token =>
        !allowedTokens.includes(token) && new RegExp(`-${token}([._-]|$)`).test(nameWithoutScope)
    ) ?? null
  );
};

const removeForeignPlatformPackages = (nodeModulesDir, platform) => {
  const removed = [];
  for (const entry of fs.readdirSync(nodeModulesDir)) {
    const packageNames = entry.startsWith("@")
      ? fs
          .readdirSync(path.join(nodeModulesDir, entry))
          .map(scopedEntry => `${entry}/${scopedEntry}`)
      : [entry];
    for (const packageName of packageNames) {
      const token = findForeignPlatformToken(packageName, platform);
      if (!token) {
        continue;
      }
      removeDir(path.join(nodeModulesDir, ...packageName.split("/")));
      removed.push(`${packageName} (token: ${token})`);
    }
  }
  if (removed.length > 0) {
    console.log(`[prune] removed foreign platform packages:\n  ${removed.join("\n  ")}`);
  }
};

const removeDir = targetPath => {
  fs.rmSync(targetPath, { recursive: true, force: true });
};

const removeEntries = (nodeModulesDir, entries) => {
  for (const entry of entries) {
    removeDir(path.join(nodeModulesDir, entry));
  }
};

const keepOnly = (targetDir, keepNames) => {
  if (!fs.existsSync(targetDir)) {
    return;
  }

  const keep = new Set(keepNames);
  for (const entry of fs.readdirSync(targetDir)) {
    if (!keep.has(entry)) {
      removeDir(path.join(targetDir, entry));
    }
  }
};

const pruneCommonBuildArtifacts = nodeModulesDir => {
  removeEntries(nodeModulesDir, [
    "better-sqlite3/bin",
    "better-sqlite3/deps",
    "better-sqlite3/src",
  ]);

  keepOnly(path.join(nodeModulesDir, "better-sqlite3", "build", "Release"), [
    "better_sqlite3.node",
  ]);
};

const pruneJavaScriptSourceMaps = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) pruneJavaScriptSourceMaps(file);
    else if (entry.isFile() && /\.[cm]?js\.map$/.test(entry.name)) fs.unlinkSync(file);
  }
};

exports.pruneJavaScriptSourceMaps = pruneJavaScriptSourceMaps;

/**
 * node-llama-cpp 为 ESM-only 且被 asarUnpack 解包。
 * pnpm 布局下其运行时依赖（chalk/ora/ipull 等）被 electron-builder 收进
 * asar 顶层 node_modules，而 unpacked 目录中的 ESM 模块解析无法回溯到
 * asar 虚拟树，因此把依赖闭包补复制到 app.asar.unpacked/node_modules 下。
 *
 * 同名依赖在闭包内可能存在多个版本（如 signal-exit v3/v4），扁平复制会
 * 相互覆盖导致 ESM named export 缺失。这里按 npm 去重规则放置：
 * 首个版本放顶层，版本冲突时嵌套到依赖方的 node_modules 下。
 */
const syncNodeLlamaCppUnpackedDeps = (nodeModulesDir, platform) => {
  const unpackedLlamaCpp = path.join(nodeModulesDir, "node-llama-cpp");
  if (!fs.existsSync(unpackedLlamaCpp)) {
    return;
  }

  // node-llama-cpp 的 exports 不含 ./package.json，不能用 require.resolve，
  // 直接从本地 node_modules 定位并解引用 pnpm 符号链接
  const localPackageJson = path.resolve(
    __dirname,
    "..",
    "node_modules",
    "node-llama-cpp",
    "package.json"
  );
  if (!fs.existsSync(localPackageJson)) {
    console.warn("[prune] local node-llama-cpp not found, skip dep sync");
    return;
  }

  const rootRealDir = path.dirname(fs.realpathSync(localPackageJson));

  // 平台二进制包（@node-llama-cpp/win-x64 等）必须位于 unpacked。
  // 只保留 CPU + Vulkan 后端（Vulkan 覆盖 NVIDIA/AMD/Intel，体积约为 CUDA 的
  // 四分之一）；CUDA 全家桶 510M 仅服务 NVIDIA，不默认打包。
  // 同时删除 electron-builder 遍历时可能解包进来的白名单外后端。
  const llamaBackendAllowlist = llamaBackendAllowlistByPlatform[platform] ?? [];

  const binsTarget = path.join(nodeModulesDir, "@node-llama-cpp");
  if (fs.existsSync(binsTarget)) {
    for (const entry of fs.readdirSync(binsTarget)) {
      if (!llamaBackendAllowlist.includes(entry)) {
        removeDir(path.join(binsTarget, entry));
      }
    }
  }

  const platformBinsSource = path.join(path.dirname(rootRealDir), "@node-llama-cpp");
  if (fs.existsSync(platformBinsSource)) {
    for (const entry of llamaBackendAllowlist) {
      const source = path.join(platformBinsSource, entry);
      const target = path.join(binsTarget, entry);
      if (!fs.existsSync(source) || fs.existsSync(target)) {
        continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(source, target, { recursive: true, dereference: true });
    }
  }

  const readDependencies = pkgDir => {
    const pkgJsonPath = path.join(pkgDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) {
      return [];
    }
    try {
      const dependencies = Object.keys(
        JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")).dependencies || {}
      );
      return dependencies.filter(dependency => !dependency.startsWith("@node-llama-cpp/"));
    } catch {
      return [];
    }
  };

  const topLevelVersions = new Map();
  const placed = new Map();
  let copied = 0;

  const placePackage = (name, realDir, importerTarget) => {
    if (placed.has(realDir)) {
      return;
    }

    const target = importerTarget
      ? path.join(importerTarget, "node_modules", name)
      : path.join(nodeModulesDir, name);

    fs.cpSync(realDir, target, { recursive: true, dereference: true });
    placed.set(realDir, target);
    copied += 1;

    // 递归放置该包的依赖：顶层无冲突则提升，否则嵌套
    const siblingNodeModules = path.dirname(realDir);
    for (const dependency of readDependencies(realDir)) {
      const linkPath = path.join(siblingNodeModules, dependency);
      if (!fs.existsSync(linkPath)) {
        continue;
      }
      const depRealDir = fs.realpathSync(linkPath);
      if (placed.has(depRealDir)) {
        continue;
      }

      const existing = topLevelVersions.get(dependency);
      if (!existing) {
        topLevelVersions.set(dependency, depRealDir);
        placePackage(dependency, depRealDir, null);
      } else if (existing === depRealDir) {
        // 同版本已提升到顶层，解析可直接命中
        continue;
      } else {
        placePackage(dependency, depRealDir, target);
      }
    }
  };

  // 从 node-llama-cpp 自身出发（它已在 unpacked 顶层），其依赖从顶层开始放
  for (const dependency of readDependencies(rootRealDir)) {
    const linkPath = path.join(path.dirname(rootRealDir), dependency);
    if (!fs.existsSync(linkPath)) {
      continue;
    }
    const depRealDir = fs.realpathSync(linkPath);
    if (placed.has(depRealDir)) {
      continue;
    }
    topLevelVersions.set(dependency, depRealDir);
    placePackage(dependency, depRealDir, null);
  }

  console.log(`[prune] synced ${copied} node-llama-cpp runtime deps into unpacked`);
};

/**
 * 从本地 pnpm store 补齐指定包的平台二进制子包到 unpacked。
 * electron-builder 在 pnpm 布局下的 manual traversal 偶发遗漏 optional
 * 平台包（如 @vscode/ripgrep-win32-x64），这里确保它们存在。
 */
const ensurePlatformSubPackages = (nodeModulesDir, packageName, platform) => {
  const localPackageJson = path.resolve(
    __dirname,
    "..",
    "node_modules",
    ...packageName.split("/"),
    "package.json"
  );
  if (!fs.existsSync(localPackageJson)) {
    return;
  }

  // .../.pnpm/<pkg>@<ver>/node_modules/<scope>/ 下有平台子包符号链接
  const realDir = path.dirname(fs.realpathSync(localPackageJson));
  const scopeDir = path.dirname(realDir);
  const scope = packageName.includes("/") ? packageName.split("/")[0] : "";
  const mainName = packageName.split("/").pop();

  for (const entry of fs.readdirSync(scopeDir)) {
    if (entry === mainName) {
      continue;
    }
    if (findForeignPlatformToken(entry, platform)) {
      continue;
    }

    const source = path.join(scopeDir, entry);
    const target = path.join(nodeModulesDir, scope ? path.join(scope, entry) : entry);
    if (fs.existsSync(target) || !fs.existsSync(path.join(source, "package.json"))) {
      continue;
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true, dereference: true });
    console.log(`[prune] restored platform package ${scope ? `${scope}/` : ""}${entry}`);
  }
};

const resolveUnpackedNodeModulesDir = context => {
  // mac 的 appOutDir 是 .app 的父目录（release/mac-arm64），resources 实际位于
  // <product>.app/Contents/Resources；win/linux 的 appOutDir 即 *-unpacked 目录
  const resourcesDir =
    context.electronPlatformName === "darwin"
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources"
        )
      : path.join(context.appOutDir, "resources");
  return path.join(resourcesDir, "app.asar.unpacked", "node_modules");
};

exports.default = async context => {
  const nodeModulesDir = resolveUnpackedNodeModulesDir(context);

  if (!fs.existsSync(nodeModulesDir)) {
    console.warn(`[prune] unpacked node_modules not found, skip: ${nodeModulesDir}`);
    return;
  }

  const platform = context.electronPlatformName;

  // 二进制包通过 postinstall 设置执行位；跨平台打包补拉的文件也需在签名前设置。
  ensurePlatformSubPackages(nodeModulesDir, "@ffprobe-installer/ffprobe", platform);
  const probeScope = path.join(nodeModulesDir, "@ffprobe-installer");
  if (fs.existsSync(probeScope)) {
    for (const name of fs.readdirSync(probeScope)) {
      if (name !== "ffprobe" && !name.startsWith(`${platform}-`)) {
        fs.rmSync(path.join(probeScope, name), { recursive: true, force: true });
        continue;
      }
      const binary = path.join(probeScope, name, "ffprobe");
      if (platform !== "win32" && fs.existsSync(binary)) fs.chmodSync(binary, 0o755);
    }
  }

  syncNodeLlamaCppUnpackedDeps(nodeModulesDir, platform);

  // ripgrep 主包已 asarUnpack（与平台包同在 unpacked 真实文件系统），
  // 平台包被 manual traversal 遗漏时在此补齐
  ensurePlatformSubPackages(nodeModulesDir, "@vscode/ripgrep", platform);

  pruneCommonBuildArtifacts(nodeModulesDir);

  if (platform === "win32") {
    removeEntries(nodeModulesDir, [
      "@firecrawl/anydoc-darwin-arm64",
      "@firecrawl/anydoc-darwin-x64",
      "@img/sharp-darwin-arm64",
      "@img/sharp-darwin-x64",
      "@img/sharp-libvips-darwin-arm64",
      "@img/sharp-libvips-darwin-x64",
      "@myriaddreamin/typst-ts-node-compiler-darwin-arm64",
      "@myriaddreamin/typst-ts-node-compiler-darwin-x64",
      "@node-rs/jieba-darwin-arm64",
      "@node-rs/jieba-darwin-x64",
      "@tailwindcss/oxide-darwin-arm64",
      "@tailwindcss/oxide-darwin-x64",
      "sqlite-vec-darwin-arm64",
      "sqlite-vec-darwin-x64",
      "7zip-bin/linux",
      "7zip-bin/mac",
    ]);
  } else if (platform === "darwin") {
    removeEntries(nodeModulesDir, [
      "@firecrawl/anydoc-win32-x64-msvc",
      "@img/sharp-win32-x64",
      "@myriaddreamin/typst-ts-node-compiler-win32-x64-msvc",
      "@node-rs/jieba-win32-x64-msvc",
      "@tailwindcss/oxide-win32-x64-msvc",
      "sqlite-vec-windows-x64",
      "7zip-bin/win",
      "7zip-bin/linux",
    ]);
  }

  // 兜底清扫：显式清单漏掉的外来平台变体（如 @vscode/ripgrep-win32-x64）
  // 统一按 token 规则删除，保证产物能过 verify-native-runtime 的同款断言
  removeForeignPlatformPackages(nodeModulesDir, platform);
  // afterPack 补复制的依赖也遵守与 files 相同的调试映射排除规则。
  pruneJavaScriptSourceMaps(nodeModulesDir);
};
