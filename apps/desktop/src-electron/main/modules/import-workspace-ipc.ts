import { ipcMain, type WebContents } from "electron";
import { randomUUID } from "node:crypto";
import { ImportWorkspace, type AssetLocation } from "../services/import-workspace";

export function registerImportWorkspaces() {
  const sessions = new Map<
    string,
    { owner: WebContents; work: ImportWorkspace; close: () => void }
  >();
  const session = (sender: WebContents, id: string) => {
    const found = sessions.get(id);
    if (!found || found.owner !== sender) throw new Error("导入已关闭");
    return found;
  };
  ipcMain.handle("import:open", ({ sender }, path: string) => {
    const id = randomUUID();
    const work = new ImportWorkspace(path);
    const close = () => {
      sender.removeListener("did-navigate", close);
      sender.removeListener("destroyed", close);
      sender.removeListener("render-process-gone", close);
      sessions.delete(id);
      work.close();
    };
    sessions.set(id, { owner: sender, work, close });
    sender.once("did-navigate", close);
    sender.once("destroyed", close);
    sender.once("render-process-gone", close);
    return id;
  });
  ipcMain.handle("import:index", ({ sender }, id) => session(sender, id).work.index());
  ipcMain.handle("import:paths", ({ sender }, id, after) => session(sender, id).work.paths(after));
  ipcMain.handle("import:save", ({ sender }, id, path, body) =>
    session(sender, id).work.save(path, body)
  );
  ipcMain.handle("import:load", ({ sender }, id, path) => session(sender, id).work.load(path));
  ipcMain.handle("import:text", async ({ sender }, id, path) =>
    new TextDecoder().decode(
      await session(sender, id).work.bytes({ kind: "source", path }, 16 * 1024 * 1024)
    )
  );
  ipcMain.handle("import:bytes", ({ sender }, id, location: AssetLocation) =>
    session(sender, id).work.bytes(location, 32 * 1024 * 1024)
  );
  ipcMain.handle("import:copy", ({ sender }, id, location: AssetLocation, name, compress) =>
    session(sender, id).work.copyAsset(location, name, compress)
  );
  ipcMain.handle("import:close", ({ sender }, id) => session(sender, id).close());
}
