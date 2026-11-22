import { CollaborationAssetService } from "../collaboration/asset-service";
import { join } from "node:path";
import { CollaborationLocalStore } from "../collaboration/local-store";

export function openWhiteboardState(
  directory: string,
  identity: ConstructorParameters<typeof CollaborationAssetService>[2]
) {
  const store = new CollaborationLocalStore(join(directory, "whiteboard-documents"), "state.db");
  try {
    return { store, assets: new CollaborationAssetService(store, directory, identity) };
  } catch (error) {
    store.db.close();
    throw error;
  }
}
