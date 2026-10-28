import type { ContentComponentsRuntime } from "@tau/plugins/components";
import { PluginContentEditor, PluginContentPreview } from "./content-components-view";
import { PluginEntityRef } from "./entity-ref-view";

export const mobileContentComponents: ContentComponentsRuntime = Object.freeze({
  ContentEditor: PluginContentEditor,
  ContentPreview: PluginContentPreview,
  EntityRef: PluginEntityRef,
});
