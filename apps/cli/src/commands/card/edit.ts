import { exec } from "node:child_process";
import { isAppRunning } from "../../data-access/notify.js";
import { rpcRequest } from "../../data-access/rpc-client.js";
import { getActiveDbName } from "../../utils/path.js";

function launchApp(dbName: string, cardId: number) {
  const platform = process.platform;
  if (platform === "darwin") {
    exec(`open -a Tau --args --open-card=${cardId} --database=${dbName}`);
  } else if (platform === "win32") {
    exec(`start "" "Tau" --open-card=${cardId} --database=${dbName}`);
  } else {
    exec(`tau --open-card=${cardId} --database=${dbName}`);
  }
}

export async function runCardEdit(cardId: number) {
  const dbName = getActiveDbName();
  const appRunning = await isAppRunning();

  if (appRunning) {
    try {
      await rpcRequest("open-card-in-new-window", [
        dbName,
        cardId,
        { showTitlebar: true },
      ]);
      console.log(`Opened card #${cardId} in Tau editor.`);
    } catch {
      console.log("RPC handler not available, launching via app...");
      launchApp(dbName, cardId);
      console.log(`Launching Tau with card #${cardId}...`);
    }
  } else {
    console.log("Tau app is not running, launching...");
    launchApp(dbName, cardId);
    console.log(`Launching Tau with card #${cardId}...`);
  }
}
