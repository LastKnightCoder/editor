import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const hash = value => createHash("sha256").update(value).digest("hex");

export function createPerfBuild(desktopDir) {
  let revision = "unknown";
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: desktopDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* 源码归档构建可以没有 Git 元数据，buildId 仍区分实际产物。 */
  }
  return {
    id: randomUUID(),
    revision,
    version: JSON.parse(readFileSync(path.join(desktopDir, "package.json"), "utf8")).version,
    directory: path.join(desktopDir, "output", "diagnostics-symbols"),
    repository: path.resolve(desktopDir, "../.."),
  };
}

export function perfSymbolsPlugin(info, target) {
  return {
    name: `tau-perf-symbols-${target}`,
    writeBundle(options, bundle) {
      const directory = path.join(info.directory, info.id);
      const files = {};
      const chunks = new Map(
        Object.values(bundle)
          .filter(chunk => chunk.type === "chunk")
          .map(chunk => [chunk.fileName, chunk])
      );
      // Vite 的嵌套 worker 以 asset 落盘，也属于同一构建归档。
      for (const name of readdirSync(options.dir, { recursive: true })) {
        if (!name.endsWith(".map")) continue;
        const fileName = name.slice(0, -4).replaceAll("\\", "/");
        if (!chunks.has(fileName)) chunks.set(fileName, { fileName });
      }
      for (const chunk of chunks.values()) {
        const codeFile = path.resolve(options.dir, chunk.fileName);
        const mapFile = `${codeFile}.map`;
        const key = `${target}/${chunk.fileName}`;
        if (!existsSync(mapFile)) {
          if (chunk.map?.sources?.length) throw new Error(`缺少诊断 sourcemap：${key}`);
          files[key] = { sha256: hash(readFileSync(codeFile)), unmapped: "generated-code" };
          continue;
        }
        const map = JSON.parse(readFileSync(mapFile, "utf8"));
        map.sources = map.sources.map(source => {
          const absolute = path.resolve(path.dirname(codeFile), map.sourceRoot ?? "", source);
          const relative = path
            .relative(
              realpathSync(info.repository),
              existsSync(absolute) ? realpathSync(absolute) : absolute
            )
            .replaceAll("\\", "/");
          return relative.startsWith("../") ? `external/${path.basename(source)}` : relative;
        });
        delete map.sourceRoot;
        const relativeMap = `${key}.map`;
        const value = JSON.stringify(map);
        const destination = path.join(directory, relativeMap);
        mkdirSync(path.dirname(destination), { recursive: true });
        writeFileSync(destination, value);
        files[key] = {
          sha256: hash(readFileSync(codeFile)),
          map: relativeMap,
          mapSha256: hash(value),
        };
        rmSync(mapFile);
      }
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        path.join(directory, `manifest-${target}.json`),
        JSON.stringify(
          {
            schemaVersion: 1,
            buildId: info.id,
            version: info.version,
            revision: info.revision,
            target,
            files,
          },
          null,
          2
        )
      );
      writeFileSync(path.join(info.directory, "latest.json"), JSON.stringify({ buildId: info.id }));
    },
  };
}
