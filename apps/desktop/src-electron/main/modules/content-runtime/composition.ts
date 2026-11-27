import { join } from "node:path";
import PathUtil from "../../utils/PathUtil";
import { CollaborationAssetService } from "../collaboration/asset-service";
import { CollaborationLocalStore } from "../collaboration/local-store";
import { ContentSessionRuntime } from ".";
import { ContentAgent } from "./agent";
import agentSchema from "@tau/db-schema/schema/content-agent.sql?raw";
import { createDesktopContentServices } from "./desktop-services";

export function createLocalContentRuntime(
  store: CollaborationLocalStore,
  assets: CollaborationAssetService
): ContentSessionRuntime {
  return new ContentSessionRuntime(createDesktopContentServices(store, assets), {
    createAgent: host => new ContentAgent(store.db, host),
  });
}

let localRuntime: ContentSessionRuntime | undefined;

export function withLocalHistoryStore(action: (store: CollaborationLocalStore) => void): void {
  if (localRuntime) return action(localRuntime.store);
  const store = new CollaborationLocalStore(
    join(PathUtil.getAppDir(), "local-content"),
    "content.db"
  );
  try {
    action(store);
  } finally {
    store.db.close();
  }
}

export function initLocalContent(): void {
  const appDirectory = PathUtil.getAppDir();
  const store = new CollaborationLocalStore(join(appDirectory, "local-content"), "content.db");
  let runtime: ContentSessionRuntime | undefined;
  try {
    store.db.exec(agentSchema);
    const assets = new CollaborationAssetService(store, appDirectory, async () => {
      throw new Error("本机正文资源无需远端身份");
    });
    runtime = createLocalContentRuntime(store, assets);
    runtime.startLocal();
    localRuntime = runtime;
  } catch (error) {
    runtime?.shutdown();
    store.db.close();
    throw error;
  }
}

export function getLocalContentRuntime(): ContentSessionRuntime {
  if (!localRuntime) throw new Error("本机正文尚未就绪");
  return localRuntime;
}

export function shutdownLocalContent(): void {
  localRuntime?.shutdown();
  localRuntime = undefined;
}
