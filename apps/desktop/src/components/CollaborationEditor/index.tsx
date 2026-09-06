import { useMemo } from "react";
import { Editor } from "@tau/editor/src";
import {
  EditorServicesProvider,
  useEditorServices,
} from "@tau/editor/src/contexts/EditorServicesContext";
import type { EditorCollaborationBinding } from "@tau/editor/src/collaboration/types";
import type { EditorServices } from "@tau/editor/src/types/services";
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
  const base = useEditorServices();
  const services = useMemo<EditorServices>(
    () =>
      binding && binding.mode !== "local"
        ? {
            ...base,
            resource: {
              ...base.resource,
              remoteResourceToLocal: async url => binding.resolveResource(url),
              upload: async file => {
                const url = await binding.uploadResource(file);
                return {
                  id: url,
                  url,
                  path: url,
                  type: file.type,
                  name: file.name,
                };
              },
              create: async () => {},
              decrementRef: async () => {},
            },
            file: { ...base.file, uploadFile: binding.uploadResource },
            customBlock: undefined,
            components: base.components
              ? {
                  ...base.components,
                  Video: createAssetMedia(base.components.Video, binding),
                  Audio: createAssetMedia(base.components.Audio, binding),
                }
              : undefined,
          }
        : base,
    [base, binding]
  );
  return <EditorServicesProvider services={services}>{children}</EditorServicesProvider>;
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
