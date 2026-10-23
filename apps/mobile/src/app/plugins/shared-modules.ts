import { portableSharedPluginModules } from "@tau/plugins/portable-shared-modules";
import { mobileMediaRuntime } from "./media-runtime";

export const mobileSharedPluginModules = Object.freeze({
  ...portableSharedPluginModules,
  "@tau/plugins": Object.freeze({
    ...portableSharedPluginModules["@tau/plugins"],
    ...mobileMediaRuntime,
  }),
});
