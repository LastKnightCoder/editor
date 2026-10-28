import { portableSharedPluginModules } from "@tau/plugins/portable-shared-modules";
import { mobileMediaRuntime } from "./media-runtime";
import { mobileContentComponents } from "./content-components";

export const mobileSharedPluginModules = Object.freeze({
  ...portableSharedPluginModules,
  "@tau/plugins": Object.freeze({
    ...portableSharedPluginModules["@tau/plugins"],
    ...mobileMediaRuntime,
    ...mobileContentComponents,
  }),
});
