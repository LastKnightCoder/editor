import { useCallback, useRef, useState, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import { Editor as SlateEditor, Element as SlateElement, type Path } from "slate";

import { toast } from "../../../components/toast";
import { startEditorRecording } from "../recording/recordingSession";
import { getEditorFromRef } from "./useToolbarSelectionState";
import type { EditorRecordingHost } from "./useMobileEditorToolbarController";

type RecordingActionsOptions = {
  editorRef: RefObject<EditorRef | null>;
  recordingHost?: EditorRecordingHost;
};

/** 录音域：宿主声明文档身份后即可在插入面板录音，含权限拒绝提示 */
export function useRecordingActions({ editorRef, recordingHost }: RecordingActionsOptions) {
  const recordingHostRef = useRef(recordingHost);
  recordingHostRef.current = recordingHost;
  const recordingEnabled = Boolean(recordingHost);
  const [recordingPermissionDenied, setRecordingPermissionDenied] = useState(false);

  const startRecording = useCallback(
    (editor: SlateEditor, replace?: { element: SlateElement; path: Path }) => {
      const host = recordingHostRef.current;
      const document = host?.document();
      if (!host || !document) {
        toast.warning("这里暂不支持录音");
        return;
      }
      try {
        void startEditorRecording({
          editor,
          document,
          documentTitle: host.documentTitle(),
          persistence: host.persistence(),
          replace,
          onPermissionDenied: () => setRecordingPermissionDenied(true),
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "当前正文不可录音");
      }
    },
    []
  );

  const rerecordAudio = useCallback(
    (element: SlateElement, path: Path) => {
      const editor = getEditorFromRef(editorRef);
      if (editor) startRecording(editor, { element, path });
    },
    [editorRef, startRecording]
  );
  const closeRecordingPermission = useCallback(() => setRecordingPermissionDenied(false), []);

  return {
    recordingEnabled,
    startRecording,
    rerecordAudio,
    recordingPermissionDenied,
    closeRecordingPermission,
  };
}
