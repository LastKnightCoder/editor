import { Editor } from "@tau/editor/src";
import type { EditorCollaborationBinding } from "@tau/editor/src/collaboration/types";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import useCollaborationPresence from "@/hooks/useCollaborationPresence";
import { useCollaborationKit } from "./useCollaborationKit";

export default function CollaborationEditor({
  binding,
  readonly = false,
}: {
  binding: EditorCollaborationBinding;
  readonly?: boolean;
}) {
  const extensions = useDynamicExtensionsStore(state => state.extensions);
  const presence = useCollaborationPresence(binding, readonly);
  const kit = useCollaborationKit(binding);
  return (
    <Editor
      kit={kit}
      collaboration={binding}
      extensions={extensions}
      readonly={readonly}
      onFocus={presence.onFocus}
      onBlur={presence.onBlur}
    />
  );
}
