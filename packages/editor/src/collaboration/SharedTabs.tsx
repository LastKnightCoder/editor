import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { Plus, X } from "lucide-react";
import {
  getBlockFields,
  getFields,
  emptyContent,
  prepareNodes,
  replaceText,
} from "@tau/collaboration";
import { slateNodesToInsertDelta } from "@slate-yjs/core";
import type { Descendant } from "slate";
import type { RenderElementProps } from "slate-react";
import { useReadOnly } from "slate-react";
import { useCollaboration } from "./context";

export default function SharedTabs({
  element,
  attributes,
  children,
  renderEditor,
}: RenderElementProps & {
  renderEditor: (root: Y.XmlText, readonly: boolean) => React.ReactNode;
}) {
  const binding = useCollaboration()!;
  const readonly = useReadOnly();
  const [, render] = useState(0);
  const [renaming, setRenaming] = useState<string>();
  const [draft, setDraft] = useState("");
  const renameInput = useRef<HTMLInputElement>(null);
  const id = (element as unknown as { collabId: string }).collabId;
  const block = getFields(binding.doc).get(id);
  const order = block?.get("tabOrder") as Y.Array<string> | undefined;
  const entries = block?.get("tabs") as Y.Map<Y.Map<unknown>> | undefined;
  const keys = [...new Set(order?.toArray() || [])].filter(key => entries?.has(key));
  const [selected, select] = useState(keys[0]);
  const active = keys.includes(selected) ? selected : keys[0];
  const root = entries?.get(active)?.get("content") as Y.XmlText | undefined;
  useEffect(() => {
    const update = () => render(value => value + 1);
    block?.observeDeep(update);
    return () => block?.unobserveDeep(update);
  }, [block]);
  useEffect(() => {
    if (renaming) renameInput.current?.select();
  }, [renaming]);
  const beginRename = (key: string) => {
    setDraft(String(entries?.get(key)?.get("title") || ""));
    setRenaming(key);
  };
  const commitRename = () => {
    const key = renaming;
    setRenaming(undefined);
    if (!key) return;
    const title = entries?.get(key)?.get("title");
    if (title instanceof Y.Text && draft !== title.toString())
      binding.doc.transact(() => replaceText(title, draft.slice(0, 100)), binding.origin);
  };
  const add = () => {
    const key = crypto.randomUUID();
    binding.doc.transact(() => {
      const fields = getBlockFields(binding.doc, id);
      let list = fields.get("tabOrder") as Y.Array<string> | undefined;
      let tabs = fields.get("tabs") as Y.Map<Y.Map<unknown>> | undefined;
      if (!list) {
        list = new Y.Array();
        fields.set("tabOrder", list);
      }
      if (!tabs) {
        tabs = new Y.Map();
        fields.set("tabs", tabs);
      }
      const tab = new Y.Map();
      tabs.set(key, tab);
      const title = new Y.Text();
      tab.set("title", title);
      title.insert(0, `标签 ${(tabs as Y.Map<unknown>).size}`);
      const content = new Y.XmlText();
      tab.set("content", content);
      content.applyDelta(
        slateNodesToInsertDelta(prepareNodes(binding.doc, emptyContent()) as Descendant[])
      );
      list.push([key]);
    }, binding.origin);
    select(key);
  };
  const remove = (key: string) => {
    binding.doc.transact(() => {
      entries?.delete(key);
      const index = order?.toArray().indexOf(key) ?? -1;
      if (index >= 0) order?.delete(index, 1);
    }, binding.origin);
  };
  return (
    <div {...attributes} style={{ margin: "12px 0" }}>
      <div contentEditable={false}>
        <div
          role="tablist"
          className="border-border-1 flex items-stretch gap-0.5 overflow-x-auto border-b"
        >
          {keys.map(key => (
            <div
              key={key}
              className={`-mb-px flex items-center gap-0.5 border-b-2 ${
                key === active ? "border-brand" : "border-transparent"
              }`}
            >
              {renaming === key ? (
                <input
                  ref={renameInput}
                  className="bg-bg-input text-text-1 w-32 rounded-md border border-[var(--th-border-focus)] px-2 py-0.5 text-[13px] shadow-[var(--th-focus-ring)] outline-none"
                  value={draft}
                  maxLength={100}
                  onChange={event => setDraft(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={event => {
                    if (event.key === "Enter") commitRename();
                    if (event.key === "Escape") setRenaming(undefined);
                  }}
                />
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={key === active}
                  className={`hover:bg-hover max-w-[12em] cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap rounded-t-md border-0 bg-transparent px-2.5 py-1.5 text-[13px] ${
                    key === active
                      ? "text-active-text font-medium"
                      : "text-text-2 hover:text-text-1"
                  }`}
                  title={readonly ? undefined : "双击或按 Enter 重命名"}
                  onClick={() => select(key)}
                  onDoubleClick={() => !readonly && beginRename(key)}
                  onKeyDown={event => {
                    if (!readonly && event.key === "Enter") {
                      event.preventDefault();
                      beginRename(key);
                    }
                  }}
                >
                  {String(entries?.get(key)?.get("title") || "标签")}
                </button>
              )}
              {!readonly && keys.length > 1 && (
                <button
                  type="button"
                  className="text-text-3 hover:bg-hover hover:text-status-error inline-flex cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-1"
                  aria-label="删除标签"
                  title="删除标签（可用撤销恢复）"
                  onClick={() => remove(key)}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {!readonly && (
            <button
              type="button"
              className="text-text-3 hover:bg-hover hover:text-text-1 ml-1 inline-flex cursor-pointer items-center justify-center self-center rounded-md border-0 bg-transparent p-1"
              aria-label="添加标签"
              title="添加标签"
              onClick={add}
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        {root && <div key={active}>{renderEditor(root, readonly)}</div>}
      </div>
      <span style={{ display: "none" }}>{children}</span>
    </div>
  );
}
