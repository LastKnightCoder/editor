import * as whiteboard from "./whiteboard";
import * as sync from "./sync";
import { portableSharedPluginModules } from "./portable-shared-modules";

export const sharedPluginModules = Object.freeze({
  ...portableSharedPluginModules,
  "@tau/plugins/whiteboard": whiteboard,
  "@tau/plugins/sync": sync,
});
