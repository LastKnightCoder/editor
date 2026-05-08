import { execFile } from "node:child_process";
import { isAppRunning } from "../../data-access/notify.js";
import { rpcRequest } from "../../data-access/rpc-client.js";
import { getActiveDbName } from "../../utils/path.js";

function launchApp(dbName: string, projectId: number) {
  const platform = process.platform;
  if (platform === "darwin") {
    execFile("open", [
      "-a",
      "Tau",
      "--args",
      `--open-project=${projectId}`,
      `--database=${dbName}`,
    ]);
  } else if (platform === "win32") {
    execFile("cmd", [
      "/c",
      "start",
      "",
      "Tau",
      `--open-project=${projectId}`,
      `--database=${dbName}`,
    ]);
  } else {
    execFile("tau", [`--open-project=${projectId}`, `--database=${dbName}`]);
  }
}

export async function runProjectEdit(projectId: number) {
  const dbName = getActiveDbName();
  const appRunning = await isAppRunning();

  if (appRunning) {
    try {
      await rpcRequest("open-project-in-new-window", [
        dbName,
        projectId,
        { showTitlebar: true },
      ]);
      console.log(`Opened project #${projectId} in Tau editor.`);
    } catch {
      console.log("RPC handler not available, launching via app...");
      launchApp(dbName, projectId);
      console.log(`Launching Tau with project #${projectId}...`);
    }
  } else {
    console.log("Tau app is not running, launching...");
    launchApp(dbName, projectId);
    console.log(`Launching Tau with project #${projectId}...`);
  }
}
