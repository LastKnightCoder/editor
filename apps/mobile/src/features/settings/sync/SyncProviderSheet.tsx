// 服务抽屉：列出全部同步服务，点选进入服务页（在服务页里才决定是否启用），不在这里直接切换。

import { ChevronRight } from "lucide-react";
import type { SettingCompat } from "../../../types";
import { BottomSheet } from "../../../components/BottomSheet";
import { LetterTile } from "../components/ui";
import { SYNC_PROVIDERS } from "./providers";

export function SyncProviderSheet(props: {
  open: boolean;
  setting: SettingCompat;
  onClose: () => void;
  onOpenProvider: (providerId: string) => void;
}) {
  const active = props.setting.sync.active;
  return (
    <BottomSheet open={props.open} title="同步服务" onClose={props.onClose}>
      <p className="text-ink-3 pb-3 text-center text-[12.5px]">
        同一时间只同步到一个服务，点进去查看或修改配置
      </p>
      <div className="space-y-2">
        {SYNC_PROVIDERS.map(provider => {
          const current = provider.id === active;
          const summary = provider.isConfigured(props.setting)
            ? provider.summary(props.setting) || "已配置"
            : "未配置";
          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => props.onOpenProvider(provider.id)}
              className={`bg-page active:bg-hover flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-3.5 py-3 text-left transition-colors ${
                current ? "border-accent" : "border-transparent"
              }`}
            >
              <LetterTile letter={provider.tile.letter} className={provider.tile.className} />
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 flex items-center gap-1.5 text-[14.5px] font-semibold">
                  {provider.name}
                  {current && (
                    <span className="bg-accent-soft text-accent-text rounded-full px-1.5 text-[10.5px] font-semibold">
                      当前
                    </span>
                  )}
                </span>
                <span className="text-ink-3 block truncate text-[11.5px]">{summary}</span>
              </span>
              <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
