import { useEffect, useState, useSyncExternalStore } from "react";
import * as Y from "yjs";
import { readNodeDocument, type ContentNode, type ContentVersionUpgrade } from "@tau/collaboration";
import type { ContentCollaborationBinding } from "@tau/editor-collab";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { Button } from "@tau/ui";
import type { EditorKit, AnyExtension } from "@tau/editor";
import { codeBlockV2Extension } from "@tau/editor/extensions/code-block";
import { desktopContentPlugins } from "../../../shared/content-plugins";
import { getContentKit } from "@/services/editorKit";
import {
  collaborationCommands,
  type PreparedContentUpgrade,
} from "@/commands/contracts/collaboration";

export function ContentUpgrade({
  documentId,
  kit,
  extensions,
  shared = false,
  binding,
  pending = false,
}: {
  documentId: string;
  kit?: EditorKit;
  extensions?: readonly AnyExtension[];
  shared?: boolean;
  binding?: ContentCollaborationBinding;
  pending?: boolean;
}) {
  const [prepared, setPrepared] = useState<PreparedContentUpgrade>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pluginRevision = useSyncExternalStore(
    desktopContentPlugins.subscribe,
    desktopContentPlugins.getRevision,
    desktopContentPlugins.getRevision
  );
  const [catalog, setCatalog] =
    useState<Awaited<ReturnType<typeof desktopContentPlugins.prepareEditorContracts>>>();
  const [count, setCount] = useState(0);
  const legacy = binding?.doc.getMap("meta").get("version") === 1;
  useEffect(() => {
    let cancelled = false;
    const base = (kit ?? getContentKit()).extend({
      extensions: [codeBlockV2Extension],
      override: true,
    });
    const assembled = extensions?.length ? base.extend({ extensions, override: true }) : base;
    void desktopContentPlugins
      .prepareEditorContracts(assembled.extensions)
      .then(value => {
        if (!cancelled) setCatalog(value);
      })
      .catch(failure => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : "节点声明不可用");
      });
    return () => {
      cancelled = true;
    };
  }, [kit, extensions, pluginRevision]);
  const canUpgrade = (node: ContentNode) => {
    const source = catalog?.resolve(node),
      target = catalog?.current(String(node.type));
    return !!(
      source &&
      target &&
      !source.current &&
      target.element.migrations?.some(item => item.from === source.contract.dataVersion)
    );
  };
  useEffect(() => {
    if (!binding || legacy || !catalog) return;
    const refresh = () => {
      let next = 0;
      const visit = (nodes: ContentNode[]) =>
        nodes.forEach(node => {
          if (canUpgrade(node)) next++;
          if (node.children) visit(node.children);
        });
      visit(readNodeDocument(binding.doc).content);
      setCount(next);
    };
    refresh();
    binding.doc.on("update", refresh);
    return () => binding.doc.off("update", refresh);
  }, [binding, legacy, catalog]);
  const run = async (action: "prepare" | "install" | "cancel") => {
    setBusy(true);
    setError(undefined);
    try {
      if (action === "prepare") {
        if (!catalog) throw new Error("节点声明尚未就绪，请稍后重试");
        let upgrade: ContentVersionUpgrade | undefined;
        let contracts = catalog.dictionary;
        if (binding && !legacy) {
          const bytes = Y.encodeStateAsUpdate(binding.doc);
          const visit = (node: ContentNode): ContentNode => {
            const converted = canUpgrade(node)
              ? (catalog.migrate(node) as ContentNode)
              : structuredClone(node);
            if (node.children) converted.children = node.children.map(visit);
            return converted;
          };
          const content = readNodeDocument(binding.doc).content.map(visit);
          const previous = binding.doc
            .getMap("node-tree:contracts")
            .toJSON() as ContentContractDictionary;
          contracts = { ...previous, ...catalog.additionalContracts(previous) };
          const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
          upgrade = {
            content,
            expectedRevision: [...new Uint8Array(digest)]
              .map(byte => byte.toString(16).padStart(2, "0"))
              .join(""),
          };
        }
        const result = await collaborationCommands.prepareUpgrade.call(
          documentId,
          contracts,
          upgrade
        );
        setPrepared(result);
        setError(result.error);
      } else if (prepared) {
        await collaborationCommands.finishUpgrade.call(prepared.operationId, action === "cancel");
        if (action === "cancel") setPrepared(undefined);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "正文升级未完成，原始数据已保留");
    } finally {
      setBusy(false);
    }
  };
  if (legacy || (!pending && !prepared && !count)) return null;
  return (
    <div
      className="border-line-1 bg-page text-ink-2 rounded-tau-md text-tau-sm flex flex-wrap items-center gap-3 border p-3"
      role="status"
    >
      <span>
        {prepared?.recoveryId
          ? `原始数据已备份。${prepared.issues.length ? `${prepared.issues.length} 处旧内容或源码冲突将原样保留，供后续恢复。` : "可以安装转换后的正文。"}`
          : `有 ${count} 个节点可升级，转换前会保全原始数据。`}
        {shared && "转换会更新共享文档。"}
      </span>
      {!prepared ? (
        <Button disabled={busy} onClick={() => void run("prepare")}>
          {busy ? "正在准备…" : "准备转换"}
        </Button>
      ) : (
        <>
          <Button
            disabled={busy}
            onClick={() => void run(prepared.recoveryId ? "install" : "prepare")}
          >
            {prepared.recoveryId ? "确认转换 / 继续恢复" : "重试准备"}
          </Button>
          <Button disabled={busy} variant="ghost" onClick={() => void run("cancel")}>
            取消
          </Button>
        </>
      )}
      {error && (
        <span role="alert" className="text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
