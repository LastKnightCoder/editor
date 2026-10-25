import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Element } from "slate";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import { IEditorTextFields, type EditorTextField } from "../../../source-contracts";
import { canEditElement } from "./elementVersions";

const EMPTY = Object.freeze({ value: "", revision: "" });
const emptySnapshot = () => EMPTY;

export function useTextFieldBinding(element: Element | undefined, field: string) {
  const editor = useSlateStatic();
  const contextReadOnly = useReadOnly();
  const readOnly = contextReadOnly || !element || !canEditElement(editor, element);
  const service = editor.tryGetService(IEditorTextFields);
  const current = useRef(element);
  current.current = element;
  const identity =
    element &&
    ((element as unknown as { collabId?: string }).collabId ??
      ReactEditor.findKey(editor, element).id);
  const contract = (element as unknown as { tauContract?: string } | undefined)?.tauContract;
  const live = useRef<EditorTextField | null>(null);
  const [opened, setOpened] = useState<{
    handle: EditorTextField;
    identity: string | undefined;
    contract: string | undefined;
    field: string;
    service: typeof service;
    editor: typeof editor;
  } | null>(null);
  const binding =
    !readOnly &&
    opened?.identity === identity &&
    opened?.contract === contract &&
    opened?.field === field &&
    opened?.service === service &&
    opened?.editor === editor &&
    opened.handle === live.current
      ? opened.handle
      : null;
  const [error, setError] = useState<string | null>(null);
  useLayoutEffect(() => {
    setOpened(null);
    setError(null);
    if (readOnly || !current.current) return;
    if (!service) {
      setError("当前文档不支持源码字段编辑");
      return;
    }
    try {
      const handle = service.open(editor, current.current, field);
      live.current = handle;
      setOpened({ handle, identity, contract, field, service, editor });
      return () => {
        if (live.current === handle) live.current = null;
        setOpened(current => (current?.handle === handle ? null : current));
        handle.dispose();
      };
    } catch (error) {
      setError(error instanceof Error ? error.message : "源码字段不可用");
    }
  }, [editor, service, identity, contract, field, readOnly]);
  const subscribe = useCallback(
    (notify: () => void) => {
      // Activity 恢复时可能先重连旧订阅，不能重新订阅已释放的句柄。
      return binding && binding === live.current ? binding.subscribe(notify) : () => {};
    },
    [binding]
  );
  const getSnapshot = useCallback(
    () => (binding && binding === live.current ? binding.getSnapshot() : EMPTY),
    [binding]
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, emptySnapshot);
  const fallback = element && (element as unknown as Record<string, unknown>)[field];
  return {
    binding,
    value: binding ? snapshot.value : typeof fallback === "string" ? fallback : "",
    revision: snapshot.revision,
    readOnly: readOnly || !binding,
    error,
  };
}
