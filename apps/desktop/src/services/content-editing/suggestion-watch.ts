/**
 * 等某次提案的条目到达指定状态：订阅主进程广播，连续变化合并成一次读取。
 * 审阅（等全部条目处理完）与提问（等作答）共用；用户中止对话时结束等待。
 */

import { bindDatabaseCommands } from "@/services/command-context";
import { listContentSuggestions } from "@/commands/content";
import { getChatDatabase } from "@/services/chatDatabase";
import { off, on } from "@/electron";
import {
  CONTENT_SUGGESTIONS_CHANGED,
  type ContentSuggestion,
  type ContentSuggestionsChange,
} from "@/types/content-suggestion";

export interface ProposalWatch {
  /** 立刻按最新记录再判断一次（如另一入口刚处理过） */
  recheck(): void;
  stop(): void;
}

/**
 * onItems 返回 true 表示已得到结果、停止观察；抛错同样停止并交给 onError。
 * 返回的句柄可在外部提前停止（工具被中止时）。
 */
export function watchProposal(options: {
  databaseName?: string;
  proposalId: string;
  onItems(items: ContentSuggestion[]): boolean | Promise<boolean>;
  onError(error: Error): void;
}): ProposalWatch {
  const database = (options.databaseName ?? getChatDatabase()).replace(/\.db$/, "");
  const commands = bindDatabaseCommands(
    { listContentSuggestions },
    { databaseName: options.databaseName }
  );
  let stopped = false;
  let reading: Promise<void> | null = null;
  let again = false;
  const stop = () => {
    stopped = true;
    off(CONTENT_SUGGESTIONS_CHANGED, onChange);
  };
  const read = () => {
    if (stopped) return;
    if (reading) {
      again = true;
      return;
    }
    reading = (async () => {
      const items = await commands.listContentSuggestions({ proposalId: options.proposalId });
      if (!stopped && (await options.onItems(items))) stop();
    })()
      .catch(error => {
        if (stopped) return;
        stop();
        options.onError(error instanceof Error ? error : new Error(String(error)));
      })
      .finally(() => {
        reading = null;
        if (again) {
          again = false;
          read();
        }
      });
  };
  const onChange = (_event: unknown, change: ContentSuggestionsChange) => {
    if (
      change.databaseName.replace(/\.db$/, "") === database &&
      change.proposalIds.includes(options.proposalId)
    )
      read();
  };
  on(CONTENT_SUGGESTIONS_CHANGED, onChange);
  read();
  return { recheck: read, stop };
}
