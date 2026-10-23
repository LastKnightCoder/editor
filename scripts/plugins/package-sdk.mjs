import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { cp, mkdir, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync(
  process.execPath,
  [path.join(root, "scripts/plugins/sync-author-docs.mjs"), "--check"],
  { stdio: "inherit" }
);
const isWorkspaceSource = source => {
  const relative = path.relative(root, source);
  return (
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative) &&
    !relative.split(path.sep).includes("node_modules")
  );
};
const require = createRequire(path.join(root, "packages/plugins/package.json"));
const ts = require("typescript");
const { build } = require("esbuild");
const output = path.resolve(process.argv[2] ?? path.join(root, "output/plugin-sdk"));
await mkdir(path.dirname(output), { recursive: true });
const staging = await mkdtemp(path.join(output + "-"));
try {
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    declaration: true,
    emitDeclarationOnly: true,
    skipLibCheck: true,
    strict: true,
    esModuleInterop: true,
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    outDir: path.join(staging, "emitted"),
    rootDir: root,
  };
  const entries = ["plugins", "ui"].map(name => path.join(root, `packages/${name}/src/index.ts`));
  const whiteboardEntry = path.join(root, "packages/plugins/src/whiteboard.ts");
  const syncEntry = path.join(root, "packages/plugins/src/sync.ts");
  const publishEntry = path.join(root, "packages/plugins/src/publish-data.ts");
  const clientEntry = path.join(root, "packages/plugins/src/publish-client.ts");
  const artifactsEntry = path.join(root, "packages/plugins/src/publish-artifacts.ts");
  const packageEntry = path.join(root, "packages/plugins/src/package.ts");
  const portableEntry = path.join(root, "packages/plugins/src/portable.ts");
  const backendEntry = path.join(root, "packages/plugins/src/backend.ts");
  const graph = ts.createProgram(
    [
      ...entries,
      whiteboardEntry,
      syncEntry,
      publishEntry,
      clientEntry,
      artifactsEntry,
      packageEntry,
      portableEntry,
      backendEntry,
    ],
    options
  );
  const program = ts.createProgram(
    graph
      .getSourceFiles()
      .filter(file => isWorkspaceSource(file.fileName))
      .map(file => file.fileName),
    options
  );
  const declarations = new Map();
  const emitted = program.emit(
    undefined,
    (_file, text, _bom, _error, sources) => {
      if (sources?.length === 1) declarations.set(path.resolve(sources[0].fileName), text);
    },
    undefined,
    true
  );
  if (emitted.emitSkipped)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(
        [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics],
        {
          getCanonicalFileName: name => name,
          getCurrentDirectory: () => root,
          getNewLine: () => "\n",
        }
      )
    );

  await mkdir(output, { recursive: true });
  for (const [index, name] of ["plugins", "ui"].entries()) {
    const { version } = JSON.parse(
      await readFile(path.join(root, `packages/${name}/package.json`), "utf8")
    );
    const directory = path.join(staging, name);
    const visited = new Set();
    const dependencies = { "@types/react": "19.2.0", "@types/react-dom": "19.2.0" };
    const targetOf = source =>
      "types/" +
      path
        .relative(root, source)
        .split(path.sep)
        .join("/")
        .replace(/\.(tsx?|jsx?)$/, ".d.ts");
    const copyDeclaration = async source => {
      source = path.resolve(source);
      if (visited.has(source)) return;
      visited.add(source);
      const text =
        declarations.get(source) ??
        (source.endsWith(".d.ts") ? await readFile(source, "utf8") : undefined);
      if (!text) throw new Error(`缺少声明产物：${source}`);
      const file = ts.createSourceFile(source, text, ts.ScriptTarget.Latest, true);
      const edits = [];
      const pending = [];
      function visit(node) {
        if (
          ts.isStringLiteral(node) &&
          (ts.isImportDeclaration(node.parent) ||
            ts.isExportDeclaration(node.parent) ||
            ts.isModuleDeclaration(node.parent) ||
            (ts.isLiteralTypeNode(node.parent) && ts.isImportTypeNode(node.parent.parent)))
        ) {
          const resolved = ts.resolveModuleName(node.text, source, options, ts.sys).resolvedModule;
          if (!resolved) throw new Error(`无法解析声明 ${source}: ${node.text}`);
          const dependency = resolved.resolvedFileName;
          if (isWorkspaceSource(dependency)) {
            let relative = path.posix
              .relative(path.posix.dirname(targetOf(source)), targetOf(dependency))
              .replace(/\.d\.ts$/, "");
            if (!relative.startsWith(".")) relative = "./" + relative;
            edits.push([node.getStart(file), node.end, JSON.stringify(relative)]);
            pending.push(dependency);
          } else if (!node.text.startsWith(".")) {
            let current = path.dirname(dependency);
            while (current !== path.dirname(current)) {
              try {
                const info = JSON.parse(
                  ts.sys.readFile(path.join(current, "package.json")) ?? "null"
                );
                if (info?.name && info.version) {
                  dependencies[info.name] = info.version;
                  break;
                }
              } catch {
                /* 父目录继续查找包声明。 */
              }
              current = path.dirname(current);
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(file);
      let rewritten = text;
      for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0]))
        rewritten = rewritten.slice(0, start) + replacement + rewritten.slice(end);
      const target = path.join(directory, targetOf(source));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, rewritten);
      for (const dependency of pending) await copyDeclaration(dependency);
    };
    await copyDeclaration(entries[index]);
    if (name === "plugins") {
      await copyDeclaration(packageEntry);
      await copyDeclaration(portableEntry);
      await copyDeclaration(backendEntry);
      await copyDeclaration(whiteboardEntry);
      await copyDeclaration(syncEntry);
      await copyDeclaration(publishEntry);
      await copyDeclaration(clientEntry);
      await copyDeclaration(artifactsEntry);
      await writeFile(path.join(directory, "publish-data.js"), "export {};\n");
      await build({
        entryPoints: {
          "publish-client": clientEntry,
          "publish-artifacts": artifactsEntry,
          package: packageEntry,
          portable: portableEntry,
        },
        outdir: directory,
        bundle: true,
        splitting: true,
        platform: "browser",
        format: "esm",
        target: "es2022",
        entryNames: "[name]",
        chunkNames: "client/[name]-[hash]",
      });
    }
    await writeFile(
      path.join(directory, "runtime.js"),
      'throw new Error("Tau 插件模块由宿主提供，请在插件构建中设为 external");\n'
    );
    await writeFile(
      path.join(directory, "package.json"),
      JSON.stringify(
        {
          name: `@xiongtao.xt/tau-${name}`,
          version,
          license: "MIT",
          repository: { type: "git", url: "git+https://github.com/LastKnightCoder/editor.git" },
          publishConfig: { access: "public", registry: "https://registry.npmjs.org" },
          type: "module",
          description: "Tau 插件作者类型契约；插件实现由宿主提供，发布数据客户端可独立使用",
          exports: {
            ".": { types: "./" + targetOf(entries[index]), default: "./runtime.js" },
            ...(name === "plugins"
              ? {
                  "./tailwind.css": "./tailwind.css",
                  "./package": { types: "./" + targetOf(packageEntry), default: "./package.js" },
                  "./portable": { types: "./" + targetOf(portableEntry), default: "./portable.js" },
                  "./backend": { types: "./" + targetOf(backendEntry), default: "./runtime.js" },
                  "./sync": { types: "./" + targetOf(syncEntry), default: "./runtime.js" },
                  "./publish-data": {
                    types: "./" + targetOf(publishEntry),
                    default: "./publish-data.js",
                  },
                  "./publish-client": {
                    types: "./" + targetOf(clientEntry),
                    default: "./publish-client.js",
                  },
                  "./publish-artifacts": {
                    types: "./" + targetOf(artifactsEntry),
                    default: "./publish-artifacts.js",
                  },
                  "./whiteboard": {
                    types: "./" + targetOf(whiteboardEntry),
                    default: "./runtime.js",
                  },
                }
              : {}),
          },
          dependencies,
          peerDependencies: { react: "19.2.0", "react-dom": "19.2.0" },
        },
        null,
        2
      )
    );
    await writeFile(
      path.join(directory, "LICENSE"),
      await readFile(path.join(root, "scripts/plugins/template/LICENSE"))
    );
    await writeFile(
      path.join(directory, "README.md"),
      `# Tau 插件开发包 @tau/${name}\n\n开发 Tau 插件所需的类型与接口，通过 npm 别名安装为 \`@tau/${name}\`。根入口的实现由 Tau 在运行时提供，插件构建时需设为 external。\n\n从模板开始开发：https://github.com/LastKnightCoder/tau-plugin-template\n${name === "plugins" ? "\n开发文档见 [docs/README.md](docs/README.md)。\n" : ""}`
    );
    if (name === "plugins") {
      await cp(path.join(root, "scripts/plugins/template/docs"), path.join(directory, "docs"), {
        recursive: true,
      });
      await writeFile(
        path.join(directory, "CHANGELOG.md"),
        await readFile(path.join(root, "packages/plugins/CHANGELOG.md"))
      );
      await writeFile(
        path.join(directory, "tailwind.css"),
        await readFile(path.join(root, "packages/themes/src/tailwind.css"))
      );
    }
    const npmCli =
      process.platform === "win32"
        ? path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js")
        : undefined;
    execFileSync(
      npmCli ? process.execPath : "npm",
      [...(npmCli ? [npmCli] : []), "pack", "--ignore-scripts", "--pack-destination", output],
      {
        cwd: directory,
        stdio: "pipe",
      }
    );
    console.log(
      `@tau/${name}: ${visited.size} 个声明文件，${Object.keys(dependencies).length} 个公开类型依赖`
    );
  }
} finally {
  await rm(staging, { recursive: true, force: true });
}
