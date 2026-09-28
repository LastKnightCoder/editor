import { useMemo } from "react";
import { Editor } from "@tau/editor/src";
import { createYjsDocument, type EditorCollaborationBinding } from "@tau/editor-collab";
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
  const document = useMemo(() => createYjsDocument(binding), [binding]);
  return (
    <Editor
      kit={kit}
      document={document}
      readonly={readonly}
      onFocus={presence.onFocus}
      onBlur={presence.onBlur}
    />
  );
}
