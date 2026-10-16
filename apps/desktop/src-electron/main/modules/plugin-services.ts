import { ipcMain, type WebContents } from "electron";
import { executePluginCompiler } from "../services/plugin-compilers";
import type { CompilerRequest, CompilerReply } from "../../../src/types/plugin-services";

const jobs = new Map<number, Map<string, AbortController>>();
const owners = new WeakSet<WebContents>();
function closeOwner(owner: number) {
  jobs.get(owner)?.forEach(controller => controller.abort());
  jobs.delete(owner);
}

export default {
  name: "plugin-services",
  async init() {
    ipcMain.handle("plugin-services:open", event => {
      if (!owners.has(event.sender)) {
        owners.add(event.sender);
        event.sender.once("destroyed", () => closeOwner(event.sender.id));
        event.sender.on("did-start-navigation", (_event, _url, inPlace, main) => {
          if (main && !inPlace) closeOwner(event.sender.id);
        });
      }
      const id = crypto.randomUUID();
      let tasks = jobs.get(event.sender.id);
      if (!tasks) {
        tasks = new Map();
        jobs.set(event.sender.id, tasks);
      }
      tasks.set(id, new AbortController());
      return id;
    });
    ipcMain.handle("plugin-services:cancel", (event, id: string) => {
      jobs.get(event.sender.id)?.get(id)?.abort();
    });
    ipcMain.handle("plugin-services:close", (event, id: string) => {
      jobs.get(event.sender.id)?.get(id)?.abort();
      jobs.get(event.sender.id)?.delete(id);
    });
    ipcMain.handle(
      "plugin-services:run",
      async (event, id: string, request: CompilerRequest): Promise<CompilerReply<unknown>> => {
        const controller = jobs.get(event.sender.id)?.get(id);
        if (!controller) return { ok: false, name: "AbortError", message: "编译任务已结束" };
        try {
          const value = await executePluginCompiler(request, controller.signal, time => {
            if (!controller.signal.aborted && !event.sender.isDestroyed())
              event.sender.send("plugin-services:progress", id, { time });
          });
          controller.signal.throwIfAborted();
          return { ok: true, value };
        } catch (error) {
          return {
            ok: false,
            name: error instanceof Error ? error.name : "Error",
            message: error instanceof Error ? error.message : String(error),
          };
        } finally {
          jobs.get(event.sender.id)?.delete(id);
        }
      }
    );
  },
};
