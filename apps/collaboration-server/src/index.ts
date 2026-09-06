import { createServer } from "./server";

process.on("unhandledRejection", reason => {
  console.error("unhandled rejection:", reason);
});
process.on("uncaughtException", error => {
  console.error("uncaught exception:", error);
  process.exit(1);
});

const server = await createServer();
await server.app.listen({ host: server.config.host, port: server.config.port });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void server.app.close().then(() => process.exit(0));
  });
}
