import { existsSync, readFileSync } from "node:fs";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";
import type { WebpackOverrideFn } from "@remotion/bundler";

// macOS 26 上 Remotion 自带的 chrome-headless-shell 的 GPU 子进程起不来，改用本机 Chrome 的新 headless
const SYSTEM_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (process.platform === "darwin" && existsSync(SYSTEM_CHROME)) {
  Config.setBrowserExecutable(SYSTEM_CHROME);
  Config.setChromeMode("chrome-for-testing");
}

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
// Remotion 的 esbuild-loader 经 typescript.sys 读 tsconfig，TypeScript 7 不再导出 sys，读不到就退回经典 JSX（React is not defined）；
// 这里把 tsconfig 原样传给 loader
const TSCONFIG = JSON.parse(readFileSync("tsconfig.json", "utf8"));
type LoaderRule = { use?: unknown };
const withTsconfig: WebpackOverrideFn = config => ({
  ...config,
  module: {
    ...config.module,
    rules: config.module?.rules?.map(rule => {
      const use = (rule as LoaderRule | undefined)?.use;
      if (!Array.isArray(use)) return rule;
      return {
        ...(rule as object),
        use: use.map((entry: { loader?: string; options?: object } | null) =>
          entry && typeof entry === "object" && String(entry.loader).includes("esbuild-loader") ? { ...entry, options: { ...entry.options, tsconfigRaw: TSCONFIG } } : entry
        ),
      };
    }),
  },
});

Config.overrideWebpackConfig(config => withTsconfig(enableTailwind(config)));
