/**
 * 占位页：page 已注册但组件尚未迁移（status: legacy/migrating）时的过渡展示。
 * M1 建立 LegacyTabPage 兼容层后，这里会改为渲染旧 TabContent（蓝图 §3.5）。
 */

import { getPageMeta } from "./core/pageMeta";

export function LegacyPendingPage({ pageKey }: { pageKey?: string }) {
  const meta = pageKey ? getPageMeta(pageKey) : undefined;
  return (
    <div className="flex h-full items-center justify-center">
      <div className="bg-surface max-w-md rounded-[var(--tau-radius-lg)] px-8 py-6 text-center shadow-[var(--tau-shadow-card)]">
        <p className="text-ink-1 text-[15px] font-medium">{meta?.label ?? pageKey ?? "未知页面"}</p>
        <p className="text-ink-2 mt-2 text-[12.5px] leading-relaxed">
          该模块尚未迁移到新架构（status: {meta?.status ?? "unknown"}）。
          <br />
          接入方式见 docs/redesign/03-架构实现指南.md。
        </p>
      </div>
    </div>
  );
}
