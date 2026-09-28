import { Editor } from "@tau/editor/src";
import type { EditorCollaborationBinding } from "@tau/editor/src/collaboration/types";
import useCollaborationPresence from "@/hooks/useCollaborationPresence";
import { useCollaborationKit } from "./useCollaborationKit";

export default function CollaborationEditor({
  binding,
  readonly = false,
}: {
  binding: EditorCollaborationBinding;
  readonly?: boolean;
}) {
  const presence = useCollaborationPresence(binding, readonly);
  const kit = useCollaborationKit(binding);
  return (
    <Editor
      kit={kit}
      collaboration={binding}
      readonly={readonly}
      onFocus={presence.onFocus}
      onBlur={presence.onBlur}
    />
  );
}
