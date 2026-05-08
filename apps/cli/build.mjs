import { build, context } from "esbuild";

const isWatch = process.argv.includes("--watch");

const emptyModulePlugin = {
  name: "empty-module",
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: "react-devtools-core",
      namespace: "empty-module",
    }));
    build.onLoad({ filter: /.*/, namespace: "empty-module" }, () => ({
      contents: "export default undefined;",
      loader: "js",
    }));
  },
};

const nativeRequirePlugin = {
  name: "native-require",
  setup(build) {
    build.onResolve({ filter: /^(better-sqlite3|sqlite-vec)$/ }, (args) => {
      if (args.namespace === "native-require") {
        return { path: args.path, external: true };
      }
      return { path: args.path, namespace: "native-require" };
    });
    build.onLoad({ filter: /.*/, namespace: "native-require" }, (args) => ({
      contents: `const mod = require('${args.path}'); export default mod;`,
      loader: "js",
    }));
  },
};

const config = {
  entryPoints: ["src/index.tsx"],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: "dist/index.js",
  format: "esm",
  jsx: "automatic",
  external: ["proxy-agent"],
  plugins: [emptyModulePlugin, nativeRequirePlugin],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
};

if (isWatch) {
  const ctx = await context(config);
  await ctx.watch();
  console.log("Watching...");
} else {
  await build(config);
}
