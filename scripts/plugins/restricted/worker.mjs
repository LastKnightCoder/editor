import { getQuickJS } from "quickjs-emscripten";
import { runWorker } from "./worker-core.mjs";

process.on("disconnect", () => process.exit(0));
runWorker(await getQuickJS(), {
  send(message) {
    if (!process.connected) return process.exit(1);
    process.send(message, error => {
      if (error) process.exit(1);
    });
  },
  onMessage: listener => process.on("message", listener),
});
