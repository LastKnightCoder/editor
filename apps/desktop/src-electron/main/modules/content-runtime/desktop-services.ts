import { ContentLocalState } from "../collaboration/content-local-state";
import { ContentRetention } from "../collaboration/content-retention";
import { NodeSessionUpdates } from "../collaboration/node-session-updates";
import type { CollaborationAssetService } from "../collaboration/asset-service";
import type { CollaborationLocalStore } from "../collaboration/local-store";
import { LocalContentSource } from "./local-content-source";
import { SqliteContentProjection } from "./sqlite-content-projection";
import { SqliteNodeSessionJournal } from "./sqlite-node-session-journal";
import type { ContentRuntimeStorage } from ".";

export function createDesktopContentServices(
  store: CollaborationLocalStore,
  assets: CollaborationAssetService
): ContentRuntimeStorage {
  const contentState = new ContentLocalState(store.db);
  return {
    store,
    assets,
    contentState,
    nodeUpdates: new NodeSessionUpdates(new SqliteNodeSessionJournal(store), contentState),
    retention: new ContentRetention(contentState),
    source: (db, name, contentId) => new LocalContentSource(db, name, contentId),
    projection: (db, source, owner) => new SqliteContentProjection(db, source, owner),
  };
}
