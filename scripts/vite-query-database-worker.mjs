import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(
  new URL("../packages/shared/src/query-database/worker.ts", import.meta.url)
);
const normalized = value => value.replaceAll("\\", "/");

/** 使用宿主已有的 Vite，在开发服务中提供可在无网络沙箱执行的独立脚本。 */
export function queryDatabaseWorkerPlugin(build) {
  let compiled;
  let watched = new Set([normalized(entry)]);
  let stopWatching;
  return {
    name: "tau-query-database-worker",
    apply: "serve",
    configureServer(server) {
      const invalidate = file => {
        if (
          watched.has(normalized(file)) ||
          normalized(file).startsWith(normalized(dirname(entry)) + "/")
        )
          compiled = undefined;
      };
      server.watcher.on("change", invalidate);
      server.watcher.on("unlink", invalidate);
      stopWatching = () => {
        server.watcher.off("change", invalidate);
        server.watcher.off("unlink", invalidate);
      };
      const source = () => {
        if (!compiled) {
          compiled = build({
            configFile: false,
            root: dirname(entry),
            logLevel: "silent",
            build: {
              write: false,
              emptyOutDir: false,
              target: "es2022",
              minify: true,
              lib: { entry, name: "TauQueryRuntime", formats: ["iife"] },
            },
          })
            .then(result => {
              const outputs = Array.isArray(result) ? result : [result];
              const chunk = outputs
                .flatMap(output => output.output)
                .find(output => output.type === "chunk" && output.isEntry);
              if (!chunk || chunk.imports.length || chunk.dynamicImports.length)
                throw new Error("查询执行器未生成独立脚本");
              watched = new Set(Object.keys(chunk.modules).map(normalized));
              server.watcher.add([...watched]);
              return chunk.code;
            })
            .catch(error => {
              compiled = undefined;
              throw error;
            });
        }
        return compiled;
      };
      server.middlewares.use(async (request, response, next) => {
        let url;
        let pathname;
        try {
          url = new URL(request.url ?? "", "http://localhost");
          pathname = decodeURIComponent(url.pathname);
        } catch {
          next();
          return;
        }
        if (
          !url.searchParams.has("worker_file") ||
          !(
            pathname.endsWith(normalized(entry)) ||
            normalized(resolve(server.config.root, "." + pathname)) === normalized(entry)
          )
        ) {
          next();
          return;
        }
        try {
          const code = await source();
          response.setHeader("Content-Type", "text/javascript; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(request.method === "HEAD" ? undefined : code);
        } catch (error) {
          server.config.logger.error("查询执行器编译失败", { error });
          response.statusCode = 500;
          response.end("查询执行器编译失败");
        }
      });
    },
    closeBundle() {
      stopWatching?.();
    },
  };
}
