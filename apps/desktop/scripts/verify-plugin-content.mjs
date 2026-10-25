import { build } from "esbuild";
import { createRequire } from "node:module";
import { cp, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const directory = await mkdtemp(path.join(tmpdir(), "tau-content-runtime-"));
try {
  if (process.argv.includes("--production")) {
    await cp(path.join(root, "dist"), directory, { recursive: true });
  } else {
    await build({
      entryPoints: [path.join(root, "src/app/plugins/content-runtime.ts")],
      outfile: path.join(directory, "renderer.js"),
      bundle: true,
      platform: "browser",
      format: "esm",
      tsconfig: path.join(root, "tsconfig.json"),
      loader: {
        ".css": "empty",
        ".svg": "dataurl",
        ".html": "text",
        ".md": "text",
        ".sql": "text",
      },
      define: { "process.env.NODE_ENV": '"production"', "import.meta.env.DEV": "false" },
    });
    await writeFile(
      path.join(directory, "content-runtime.html"),
      (await readFile(path.join(root, "content-runtime.html"), "utf8")).replace(
        "/src/app/plugins/content-runtime.ts",
        "./renderer.js"
      )
    );
  }
  await build({
    entryPoints: [path.join(root, "scripts/plugin-backend/content-main.ts")],
    outfile: path.join(directory, "main.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    tsconfig: path.join(root, "tsconfig.json"),
  });
  const env = {
    ...process.env,
    TAU_BACKEND_TEST_DIRECTORY: directory,
    TAU_PLUGIN_FIXTURE_CATALOG: path.resolve(root, "../../tests/fixtures/plugins/catalog.json"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = createRequire(path.join(root, "package.json"))("electron");
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [path.join(directory, "main.cjs")], { env, stdio: "inherit" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("内容进程验证超时"));
    }, 45_000);
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`内容验证退出码 ${code}`));
    });
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
