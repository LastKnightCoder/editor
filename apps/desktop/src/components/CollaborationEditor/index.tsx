import { useMemo } from "react";
import { Editor } from "@tau/editor/src";
import {
  EditorProvider,
  createChildRegistry,
  useServiceRegistry,
  IEditorSlots,
  IResourceService,
  type ServiceRegistry,
} from "@tau/editor/src";
import type { EditorCollaborationBinding } from "@tau/editor/src/collaboration/types";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { createAssetMedia } from "./AssetMedia";
import useCollaborationPresence from "@/hooks/useCollaborationPresence";

export function CollaborationServices({
  binding,
  children,
}: {
  binding?: EditorCollaborationBinding;
  children: React.ReactNode;
}) {
  const baseRegistry = useServiceRegistry();
  const registry = useMemo<ServiceRegistry>(
    () =>
      binding && binding.mode !== "local"
        ? createChildRegistry(baseRegistry, register => {
            register(IResourceService, {
              ...baseRegistry.get(IResourceService),
              remoteResourceToLocal: async url => binding.resolveResource(url),
              upload: file => binding.uploadResource(file),
            });
            register(IEditorSlots, () => {
              const slots = baseRegistry.get(IEditorSlots);
              return {
                ...slots,
                Video: createAssetMedia(slots.Video, binding),
                Audio: createAssetMedia(slots.Audio, binding),
              };
            });
          })
        : baseRegistry,
    [baseRegistry, binding]
  );
  return <EditorProvider registry={registry}>{children}</EditorProvider>;
}

export default function CollaborationEditor({
  binding,
  readonly = false,
}: {
  binding: EditorCollaborationBinding;
  readonly?: boolean;
}) {
  const extensions = useDynamicExtensionsStore(state => state.extensions);
  const presence = useCollaborationPresence(binding, readonly);
  return (
    <CollaborationServices binding={binding}>
      <Editor
        collaboration={binding}
        extensions={extensions}
        readonly={readonly}
        onFocus={presence.onFocus}
        onBlur={presence.onBlur}
      />
    </CollaborationServices>
  );
}
