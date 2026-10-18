import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdir, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "packages/plugins/package.json"));
const ts = require("typescript");
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
  const graph = ts.createProgram([...entries, whiteboardEntry, syncEntry], options);
  const program = ts.createProgram(
    graph
      .getSourceFiles()
      .filter(
        file => file.fileName.startsWith(root + "/") && !file.fileName.includes("/node_modules/")
      )
      .map(file => file.fileName),
    options
  );
  const declarations = new Map();
  const emitted = program.emit(
    undefined,
    (_file, text, _bom, _error, sources) => {
      if (sources?.length === 1) declarations.set(sources[0].fileName, text);
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
      "types/" + path.relative(root, source).replace(/\.(tsx?|jsx?)$/, ".d.ts");
    const copyDeclaration = async source => {
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
          if (dependency.startsWith(root + "/") && !dependency.includes("/node_modules/")) {
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
      await writeFile(
        path.join(directory, "SYNC.md"),
        await readFile(path.join(root, "scripts/plugins/template/SYNC.md"))
      );
      await copyDeclaration(whiteboardEntry);
      await copyDeclaration(syncEntry);
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
          description: "Tau 插件作者类型契约；运行时由宿主提供",
          exports: {
            ".": { types: "./" + targetOf(entries[index]), default: "./runtime.js" },
            ...(name === "plugins"
              ? {
                  "./tailwind.css": "./tailwind.css",
                  "./sync": { types: "./" + targetOf(syncEntry), default: "./runtime.js" },
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
      `# Tau 插件开发包 @tau/${name}\n\n开发 Tau 插件所需的类型与接口，通过 npm 别名安装为 \`@tau/${name}\`。实际实现由 Tau 客户端在运行时提供，构建时需设为 external，不能在普通 Node.js 程序中直接运行。\n\n从模板开始开发：https://github.com/LastKnightCoder/tau-plugin-template\n${name === "plugins" ? "\n编译与转换服务见 [SERVICES.md](SERVICES.md)，编辑器扩展、源码预览与插件 Skill 见 [EDITOR.md](EDITOR.md)，需要 Tau 0.59.0 及以上。AI 功能声明、模型分配与用量审计见 [AI.md](AI.md)。\n" : ""}`
    );
    if (name === "plugins") {
      await writeFile(
        path.join(directory, "tailwind.css"),
        await readFile(path.join(root, "packages/themes/src/tailwind.css"))
      );
      await writeFile(
        path.join(directory, "WHITEBOARD.md"),
        await readFile(path.join(root, "scripts/plugins/template/WHITEBOARD.md"))
      );
      await writeFile(
        path.join(directory, "AI.md"),
        await readFile(path.join(root, "scripts/plugins/template/AI.md"))
      );
      await writeFile(
        path.join(directory, "MCP.md"),
        await readFile(path.join(root, "scripts/plugins/template/MCP.md"))
      );
      await writeFile(
        path.join(directory, "EDITOR.md"),
        await readFile(path.join(root, "scripts/plugins/template/EDITOR.md"))
      );
      await writeFile(
        path.join(directory, "SERVICES.md"),
        await readFile(path.join(root, "scripts/plugins/template/SERVICES.md"))
      );
    }
    execFileSync("npm", ["pack", "--ignore-scripts", "--pack-destination", output], {
      cwd: directory,
      stdio: "pipe",
    });
    console.log(
      `@tau/${name}: ${visited.size} 个声明文件，${Object.keys(dependencies).length} 个公开类型依赖`
    );
  }
} finally {
  await rm(staging, { recursive: true, force: true });
}
