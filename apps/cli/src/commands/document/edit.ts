import { execFile } from "node:child_process";
import { isAppRunning } from "../../data-access/notify.js";
import { rpcRequest } from "../../data-access/rpc-client.js";
import { getActiveDbName } from "../../utils/path.js";

function launchApp(dbName: string, docId: number) {
  const platform = process.platform;
  if (platform === "darwin") {
    execFile("open", [
      "-a",
      "Tau",
      "--args",
      `--open-document=${docId}`,
      `--database=${dbName}`,
    ]);
  } else if (platform === "win32") {
    execFile("cmd", [
      "/c",
      "start",
      "",
      "Tau",
      `--open-document=${docId}`,
      `--database=${dbName}`,
    ]);
  } else {
    execFile("tau", [`--open-document=${docId}`, `--database=${dbName}`]);
  }
}

export async function runDocumentEdit(docId: number) {
  const dbName = getActiveDbName();
  const appRunning = await isAppRunning();

  if (appRunning) {
    try {
      await rpcRequest("open-document-in-new-window", [
        dbName,
        docId,
        { showTitlebar: true },
      ]);
      console.log(`Opened document #${docId} in Tau editor.`);
    } catch {
      console.log("RPC handler not available, launching via app...");
      launchApp(dbName, docId);
      console.log(`Launching Tau with document #${docId}...`);
    }
  } else {
    console.log("Tau app is not running, launching...");
    launchApp(dbName, docId);
    console.log(`Launching Tau with document #${docId}...`);
  }
}
