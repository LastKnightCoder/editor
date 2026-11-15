import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type { createServer } from "../../../collaboration-server/src/server";

export type CollaborationTestServer = Awaited<ReturnType<typeof createServer>>;

export async function startCollaborationServer(
  desktop: string,
  output: string,
  dataDir: string,
  configure?: (server: CollaborationTestServer) => void
) {
  await mkdir(output, { recursive: true });
  const serverRequire = createRequire(resolve(desktop, "../collaboration-server/package.json"));
  const localRequire = createRequire(join(desktop, "package.json"));
  const artifact = join(output, "server.cjs");
  await build({
    entryPoints: [resolve(desktop, "../collaboration-server/src/server.ts")],
    outfile: artifact,
    external: ["yjs", "y-protocols/*"],
    bundle: true,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "server-native-runtime",
        setup(build) {
          build.onResolve({ filter: /^better-sqlite3$/ }, () => ({
            path: serverRequire.resolve("better-sqlite3"),
            external: true,
          }));
        },
      },
    ],
  });
  const server: CollaborationTestServer = await (
    localRequire(artifact) as { createServer: typeof createServer }
  ).createServer({ dataDir, logger: false });
  try {
    configure?.(server);
    await server.app.listen({ host: "127.0.0.1", port: 0 });
    return { server, url: `http://127.0.0.1:${serverPort(server)}` };
  } catch (error) {
    await server.app.close();
    throw error;
  }
}

function serverPort({ app }: CollaborationTestServer) {
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("未取得协作服务端口");
  return address.port;
}
