import { execFile } from "node:child_process";
import { isAppRunning } from "../../data-access/notify.js";
import { rpcRequest } from "../../data-access/rpc-client.js";
import { getActiveDbName } from "../../utils/path.js";

function launchApp(dbName: string, articleId: number) {
  const platform = process.platform;
  if (platform === "darwin") {
    execFile("open", [
      "-a",
      "Tau",
      "--args",
      `--open-article=${articleId}`,
      `--database=${dbName}`,
    ]);
  } else if (platform === "win32") {
    execFile("cmd", [
      "/c",
      "start",
      "",
      "Tau",
      `--open-article=${articleId}`,
      `--database=${dbName}`,
    ]);
  } else {
    execFile("tau", [`--open-article=${articleId}`, `--database=${dbName}`]);
  }
}

export async function runArticleEdit(articleId: number) {
  const dbName = getActiveDbName();
  const appRunning = await isAppRunning();

  if (appRunning) {
    try {
      await rpcRequest("open-article-in-new-window", [
        dbName,
        articleId,
        { showTitlebar: true },
      ]);
      console.log(`Opened article #${articleId} in Tau editor.`);
    } catch {
      console.log("RPC handler not available, launching via app...");
      launchApp(dbName, articleId);
      console.log(`Launching Tau with article #${articleId}...`);
    }
  } else {
    console.log("Tau app is not running, launching...");
    launchApp(dbName, articleId);
    console.log(`Launching Tau with article #${articleId}...`);
  }
}
