/**
 * 页面笔记页：伴读面板「笔记」页签里的 iframe（扩展自己的页面，编辑器在独立文档里运行，
 * 选区、浮层与样式都不受网页影响）。草稿是编辑器原生节点，按页面存在本机；
 * 「保存为卡片」把节点交给 Tau 新建一张带来源链接的卡片，草稿随即清空。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Editor as SlateEditor, Transforms, type Descendant } from "slate";
import { Editor } from "@tau/editor";
import { Button, ToastHost, toast } from "@tau/ui";
import { applyThemeToDom } from "@tau/themes/dom";
import { COMPANION_METHODS, type NoteSaveResult } from "@tau/shared/browser-companion";
import type { ConnectionStatus } from "../shared/messages";
import {
  noteDraftKey,
  notePendingKey,
  noteSavedKey,
  STATUS_KEY,
  type NotePageMessage,
  type NotePageReply,
  type SavedNote,
} from "../shared/note-storage";
import type { KeyValueStore } from "../background/connection";
import { EMPTY_NOTE, isEmptyNote, loadDraft, notePreview, takePending } from "./draft";
import { getNoteKit, markdownToNodes } from "./kit";

const SAVE_DEBOUNCE_MS = 400;

const storage: KeyValueStore = {
  async get<T>(key: string) {
    return (await chrome.storage.local.get(key))[key] as T | undefined;
  },
  set: (key, value) => chrome.storage.local.set({ [key]: value }),
  remove: key => chrome.storage.local.remove(key),
};

async function callTau<T>(method: string, params: unknown): Promise<T> {
  const reply = (await chrome.runtime.sendMessage({
    kind: "note-rpc",
    method,
    params,
  } satisfies NotePageMessage)) as NotePageReply | undefined;
  if (!reply) throw new Error("扩展后台没有响应");
  if (!reply.ok) throw new Error(reply.error);
  return reply.result as T;
}

const params = new URLSearchParams(location.search);
const pageUrl = params.get("url") ?? "";
const pageTitle = params.get("title") ?? "";

const prefersDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

export function NoteApp() {
  const [initial, setInitial] = useState<Descendant[] | null>(null);
  const [empty, setEmpty] = useState(true);
  const [status, setStatus] = useState<ConnectionStatus>({ state: "unpaired" });
  const [saved, setSaved] = useState<SavedNote[]>([]);
  const [saving, setSaving] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const editorRef = useRef<SlateEditor | null>(null);
  const valueRef = useRef<Descendant[]>(EMPTY_NOTE);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const kit = useMemo(() => getNoteKit(), []);

  const persist = useCallback((value: Descendant[]) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => void storage.set(noteDraftKey(pageUrl), value),
      SAVE_DEBOUNCE_MS
    );
  }, []);

  /** 把待追加的片段接到编辑器末尾；编辑器还没就绪时留在队列里，就绪后再取 */
  const drainPending = useCallback(async () => {
    if (!editorRef.current) return;
    const nodes = await takePending(storage, pageUrl, markdownToNodes);
    const editor = editorRef.current;
    if (!nodes?.length || !editor) return;
    SlateEditor.withoutNormalizing(editor, () => {
      if (isEmptyNote(editor.children)) {
        Transforms.removeNodes(editor, { at: [0] });
        Transforms.insertNodes(editor, nodes, { at: [0] });
      } else {
        Transforms.insertNodes(editor, nodes, { at: [editor.children.length] });
      }
    });
  }, []);

  useEffect(() => {
    void (async () => {
      const [draft, currentStatus, savedNotes] = await Promise.all([
        loadDraft(storage, pageUrl, markdownToNodes),
        storage.get<ConnectionStatus>(STATUS_KEY),
        storage.get<SavedNote[]>(noteSavedKey(pageUrl)),
      ]);
      const value = draft;
      valueRef.current = value;
      setEmpty(isEmptyNote(value));
      setInitial(value);
      if (currentStatus) setStatus(currentStatus);
      setSaved(savedNotes ?? []);
    })();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      if (changes[notePendingKey(pageUrl)]?.newValue) void drainPending();
      const next = changes[STATUS_KEY]?.newValue as ConnectionStatus | undefined;
      if (next) setStatus(next);
      const nextSaved = changes[noteSavedKey(pageUrl)];
      if (nextSaved) setSaved((nextSaved.newValue as SavedNote[] | undefined) ?? []);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [drainPending]);

  useEffect(() => {
    const appearance = status.appearance;
    applyThemeToDom(
      appearance?.theme ?? "paper",
      appearance?.mode ?? (prefersDark() ? "dark" : "light")
    );
  }, [status.appearance]);

  const ready = status.state === "ready";

  const save = async () => {
    const content = valueRef.current;
    if (isEmptyNote(content) || !ready || saving) return;
    setSaving(true);
    try {
      const result = await callTau<NoteSaveResult>(COMPANION_METHODS.noteSave, {
        url: pageUrl,
        title: pageTitle,
        content,
      });
      const next = [
        { cardId: result.cardId, savedAt: Date.now(), preview: notePreview(content) },
        ...saved,
      ].slice(0, 20);
      await storage.set(noteSavedKey(pageUrl), next);
      setSaved(next);
      clearTimeout(timer.current);
      await storage.set(noteDraftKey(pageUrl), EMPTY_NOTE);
      valueRef.current = EMPTY_NOTE;
      setEmpty(true);
      setInitial(EMPTY_NOTE);
      editorRef.current = null;
      setEditorKey(key => key + 1);
      toast.success("已保存为 Tau 卡片，附带来源链接");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const openCard = (cardId: number) =>
    void callTau(COMPANION_METHODS.noteOpen, { cardId })
      .then(() => toast.success("已在 Tau 中打开"))
      .catch(() => toast.error("Tau 未连接"));

  return (
    <div className="bg-surface text-ink-1 flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {initial && (
          <Editor
            key={editorKey}
            kit={kit}
            initValue={initial}
            readonly={false}
            onInit={editor => {
              editorRef.current = editor;
              void drainPending();
            }}
            onChange={value => {
              valueRef.current = value;
              setEmpty(isEmptyNote(value));
              persist(value);
            }}
            placeHolder="写点什么，输入 / 插入"
            style={{ minHeight: "100%", padding: "10px 18px 24px", fontSize: "14px" }}
          />
        )}
      </div>
      {saved.length > 0 && (
        <div className="mx-4 pt-2">
          <p className="text-tau-sm text-ink-3 mb-1">已保存的卡片</p>
          <ul className="max-h-[96px] overflow-y-auto">
            {saved.map(item => (
              <li key={item.cardId}>
                <button
                  type="button"
                  onClick={() => openCard(item.cardId)}
                  className="text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm flex w-full items-center gap-1.5 px-1.5 py-1 text-left"
                >
                  <span className="min-w-0 flex-1 truncate">{item.preview || "（无文字）"}</span>
                  <ArrowUpRight size={13} strokeWidth={1.8} className="flex-none" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="text-tau-sm text-ink-3 flex items-center gap-2 px-4 pt-2 pb-3">
        自动保存在本机
        <span className="flex-1" />
        <Button
          size="sm"
          variant="primary"
          loading={saving}
          disabled={empty || !ready}
          title={ready ? undefined : "连上 Tau 后才能保存"}
          onClick={() => void save()}
        >
          保存为卡片
        </Button>
      </div>
      <ToastHost />
    </div>
  );
}
