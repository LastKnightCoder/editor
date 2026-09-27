/**
 * 块预览页（D-057 方案 B「预览上正文，对话退到停靠栏」）：一整张纸里放统一预览框。
 *
 * 会话块按「会话 + key」从对话仓库实时派生：生成中逐字更新；停靠栏里继续追问产生的新版本
 * 直接出现在版本切换里（切版本是页内状态，不进后退历史）。快照块（JSON）原样显示。
 * 关闭 = 后退（回到打开预览的页面）；块已不在对话里（消息被删 / 重新生成）时给出空态。
 */

import { useEffect, useMemo, useState } from "react";
import { FileQuestion } from "lucide-react";
import { Button } from "@tau/ui";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import useChatSessionStore from "@/stores/useChatSessionStore";
import { blockRegistry } from "@/utils/blockRegistry";
import type { BlockData } from "@/types/block-preview";
import { BlockPreviewFrame } from "../components/BlockPreviewFrame";
import { toBlockData, useChatBlocks } from "../useChatBlocks";
import { versionsOf } from "../model/chatBlocks";

type Params = {
  id: string;
  /** 来源会话 id（pi 会话 id）；旧版本存的 number 参数按不存在处理 */
  chat?: string;
  key?: string;
  block?: string;
};

function parseSnapshot(serialized: string | undefined): BlockData | null {
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as BlockData;
    return value &&
      typeof value.type === "string" &&
      typeof value.content === "string" &&
      value.metadata
      ? value
      : null;
  } catch {
    return null;
  }
}

export function BlockPreviewView() {
  const params = usePageParams<Params>();
  const { navigator } = usePage();
  const close = () => (navigator.canBack() ? navigator.back() : navigator.push("home"));

  const chatId = typeof params.chat === "string" && params.chat ? params.chat : null;
  const blocks = useChatBlocks(chatId);
  const chatTitle = useChatSessionStore(s => (chatId ? s.opened[chatId]?.title : undefined));
  // 预览页可能先于对话被打开（历史记录后退回来）：按需打开对话读投影
  useEffect(() => {
    if (chatId) void useChatSessionStore.getState().openChat(chatId);
  }, [chatId]);
  const [activeKey, setActiveKey] = useState(params.key);
  useEffect(() => setActiveKey(params.key), [params.key]);

  const snapshot = useMemo(() => parseSnapshot(params.block), [params.block]);
  const live = chatId != null ? blocks.find(b => b.key === activeKey) : undefined;
  const block = live && chatId != null ? toBlockData(chatId, live) : snapshot;
  const renderer = block ? blockRegistry.find(block) : undefined;

  const versions = useMemo(() => {
    if (!live) return undefined;
    const group = versionsOf(blocks, live);
    const at = group.findIndex(b => b.key === live.key);
    return {
      version: at + 1,
      count: group.length,
      onPrev: () => at > 0 && setActiveKey(group[at - 1].key),
      onNext: () => at < group.length - 1 && setActiveKey(group[at + 1].key),
    };
  }, [blocks, live]);

  const title = block?.metadata.title || renderer?.label || "内容预览";
  const breadcrumb = useMemo(
    () => (
      <span className="text-tau-meta text-ink-2 flex min-w-0 items-center gap-1">
        {chatId != null && (
          <>
            <button
              type="button"
              onClick={() => navigator.push("chat", { id: chatId })}
              title="在对话页打开"
              className="ease-tau-out hover:text-accent-text rounded-tau-sm hover:bg-hover max-w-[28ch] truncate px-1.5 py-0.5 transition-colors"
            >
              {chatTitle || "AI 对话"}
            </button>
            <span className="text-ink-3">/</span>
          </>
        )}
        <span className="text-ink-1 max-w-[44ch] truncate px-1 font-medium">{title}</span>
      </span>
    ),
    [chatId, chatTitle, navigator, title]
  );
  usePageBreadcrumb("block-preview", breadcrumb);

  return (
    <div className="flex h-full min-h-0 flex-col px-4 pb-4">
      <section className="bg-surface rounded-tau-lg shadow-card flex min-h-0 flex-1 flex-col overflow-hidden">
        {block && renderer ? (
          <BlockPreviewFrame
            block={block}
            renderer={renderer}
            generating={Boolean(live?.generating)}
            versions={versions}
            onClose={close}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
            <FileQuestion size={28} strokeWidth={1.5} className="text-ink-3 mb-2" />
            <p className="text-ink-1 text-[15px] font-semibold">
              {chatId != null ? "这段内容已不在对话里" : "无法预览此内容"}
            </p>
            <p className="text-tau-sm text-ink-2">
              {chatId != null
                ? "对应的消息可能已被删除或重新生成。"
                : "内容格式无法识别，或来源已失效。"}
            </p>
            <Button size="sm" className="mt-3" onClick={close}>
              返回
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
