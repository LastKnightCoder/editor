import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);

function directories(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(directory, entry.name));
}

function contains(directory, file) {
  const relative = path.relative(directory, file);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

export function findStalePluginBuilds({ targetDir, tauriDir, plugins }) {
  const stale = [];
  // Cargo 将宿主产物放在 target/<profile>，交叉编译产物放在 target/<triple>/<profile>。
  const profiles = directories(targetDir).flatMap(directory => [
    directory,
    ...directories(directory),
  ]);
  for (const profileDir of profiles) {
    const packages = new Set();
    for (const buildDir of directories(path.join(profileDir, "build"))) {
      const plugin = plugins.find(({ name }) => path.basename(buildDir).startsWith(`${name}-`));
      if (!plugin) continue;
      const listFile = path.join(buildDir, "out", `${plugin.name}-permission-files`);
      const permissionsDir = path.join(fs.realpathSync(plugin.path), "permissions");
      const stalePermissions =
        fs.existsSync(listFile) &&
        JSON.parse(fs.readFileSync(listFile, "utf8")).some(
          file => !contains(permissionsDir, file) || !fs.existsSync(file)
        );
      const output = path.join(buildDir, "output");
      const nativePaths = fs.existsSync(output)
        ? [
            ...fs
              .readFileSync(output, "utf8")
              .matchAll(/^cargo:(?:android|ios)_library_path=(.+)$/gm),
          ].map(match => match[1].trim())
        : [];
      if (
        stalePermissions ||
        nativePaths.some(file => !contains(tauriDir, path.resolve(file)) || !fs.existsSync(file))
      ) {
        packages.add(plugin.name);
      }
    }
    if (packages.size) {
      const target = path.relative(targetDir, path.dirname(profileDir));
      stale.push({
        profile: path.basename(profileDir) === "debug" ? "dev" : path.basename(profileDir),
        target: target || null,
        packages: [...packages],
      });
    }
  }
  return stale;
}

export function prepareTauriCache({
  mobileDir = path.resolve(path.dirname(scriptPath), ".."),
} = {}) {
  const tauriDir = fs.realpathSync(path.join(mobileDir, "src-tauri"));
  const manifest = path.join(tauriDir, "Cargo.toml");
  const metadata = JSON.parse(
    execFileSync(
      "cargo",
      ["metadata", "--manifest-path", manifest, "--format-version", "1", "--no-deps", "--offline"],
      { encoding: "utf8" }
    )
  );
  const app = metadata.packages.find(pkg => pkg.manifest_path === manifest);
  const plugins = app.dependencies.filter(
    dependency => dependency.path && dependency.name.startsWith("tauri-plugin-")
  );
  for (const { profile, target, packages } of findStalePluginBuilds({
    targetDir: metadata.target_directory,
    tauriDir,
    plugins,
  })) {
    console.log(
      `清理 Tauri 插件过期路径缓存（${target ?? "host"}/${profile}）：${packages.join("、")}`
    );
    execFileSync(
      "cargo",
      [
        "clean",
        "--manifest-path",
        manifest,
        "--target-dir",
        metadata.target_directory,
        "--profile",
        profile,
        ...(target ? ["--target", target] : []),
        ...packages.flatMap(name => ["-p", name]),
      ],
      { stdio: "inherit" }
    );
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(scriptPath)) {
  prepareTauriCache();
}
