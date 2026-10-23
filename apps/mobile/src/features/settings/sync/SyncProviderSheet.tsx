// 服务抽屉：列出全部同步服务，点选进入服务页（在服务页里才决定是否启用），不在这里直接切换。

import type { SettingCompat } from "../../../types";
import { BottomSheet } from "../../../components/BottomSheet";
import { LetterTile } from "../components/ui";
import { ServiceOption } from "../storage/fields";
import { useSyncProviders } from "./providers";

export function SyncProviderSheet(props: {
  open: boolean;
  setting: SettingCompat;
  onClose: () => void;
  onOpenProvider: (providerId: string) => void;
}) {
  const providers = useSyncProviders();
  return (
    <BottomSheet open={props.open} title="同步服务" onClose={props.onClose}>
      <p className="text-ink-3 pb-3 text-center text-[12.5px]">
        同一时间只同步到一个服务，点进去查看或修改配置
      </p>
      <div className="space-y-2">
        {providers.map(provider => (
          <ServiceOption
            key={provider.id}
            icon={<LetterTile letter={provider.tile.letter} className={provider.tile.className} />}
            name={provider.name}
            summary={
              provider.isConfigured(props.setting)
                ? provider.summary(props.setting) || "已配置"
                : "未配置"
            }
            current={provider.id === props.setting.sync.plugin?.id}
            onClick={() => props.onOpenProvider(provider.id)}
          />
        ))}
      </div>
    </BottomSheet>
  );
}
