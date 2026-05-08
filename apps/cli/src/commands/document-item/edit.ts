import { execFile } from "node:child_process";
import { isAppRunning } from "../../data-access/notify.js";
import { rpcRequest } from "../../data-access/rpc-client.js";
import { getActiveDbName } from "../../utils/path.js";

function launchApp(dbName: string, itemId: number) {
  const platform = process.platform;
  if (platform === "darwin") {
    execFile("open", [
      "-a",
      "Tau",
      "--args",
      `--open-document-item=${itemId}`,
      `--database=${dbName}`,
    ]);
  } else if (platform === "win32") {
    execFile("cmd", [
      "/c",
      "start",
      "",
      "Tau",
      `--open-document-item=${itemId}`,
      `--database=${dbName}`,
    ]);
  } else {
    execFile("tau", [`--open-document-item=${itemId}`, `--database=${dbName}`]);
  }
}

export async function runDocumentItemEdit(itemId: number) {
  const dbName = getActiveDbName();
  const appRunning = await isAppRunning();

  if (appRunning) {
    try {
      await rpcRequest("open-document-item-in-new-window", [
        dbName,
        itemId,
        { showTitlebar: true },
      ]);
    } catch {
      launchApp(dbName, itemId);
    }
  } else {
    launchApp(dbName, itemId);
  }
}
