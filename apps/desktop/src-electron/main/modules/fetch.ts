import { ipcMain, type WebContents } from "electron";
import { FetchServer } from "../services/fetch-server";
import type { FetchReply } from "../../../src/services/fetch-bridge";

const server = new FetchServer();
const owners = new WeakSet<WebContents>();
async function reply<T>(run: () => T | Promise<T>): Promise<FetchReply<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return {
      ok: false,
      error: {
        name: error instanceof Error ? error.name : "TypeError",
        message: error instanceof Error ? error.message : "Fetch failed",
      },
    };
  }
}
export default {
  name: "fetch",
  async init() {
    ipcMain.handle("fetch:open", (event, data) =>
      reply(() => {
        if (!owners.has(event.sender)) {
          owners.add(event.sender);
          const owner = event.sender.id;
          event.sender.once("destroyed", () => server.closeOwner(owner));
          event.sender.on("did-start-navigation", (_event, _url, inPlace, isMainFrame) => {
            if (isMainFrame && !inPlace) server.closeOwner(owner);
          });
        }
        return server.open(event.sender.id, data);
      })
    );
    ipcMain.handle("fetch:upload", (event, id, chunk) =>
      reply(() => server.upload(event.sender.id, id, chunk))
    );
    ipcMain.handle("fetch:response", (event, id) =>
      reply(() => server.response(event.sender.id, id))
    );
    ipcMain.handle("fetch:read", (event, id) => reply(() => server.read(event.sender.id, id)));
    ipcMain.handle("fetch:cancel", (event, id) => reply(() => server.cancel(event.sender.id, id)));
  },
};
