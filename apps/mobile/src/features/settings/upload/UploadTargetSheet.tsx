// 上传位置抽屉：「这台手机」无需配置，点选即切换；云端服务点选进入服务页，在服务页里再决定是否启用。

import { Smartphone } from "lucide-react";
import type { SettingCompat } from "../../../types";
import { BottomSheet } from "../../../components/BottomSheet";
import { LetterTile } from "../components/ui";
import { ServiceOption } from "../storage/fields";
import { LOCAL_UPLOAD_ID, UPLOAD_PROVIDERS } from "./providers";

export function LocalTile() {
  return (
    <span className="bg-tag-4-soft text-tag-4 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
      <Smartphone size={17} strokeWidth={1.9} aria-hidden="true" />
    </span>
  );
}

export function UploadTargetSheet(props: {
  open: boolean;
  setting: SettingCompat;
  onClose: () => void;
  onSelectLocal: () => void;
  onOpenProvider: (providerId: string) => void;
}) {
  const active = props.setting.imageBed.active;
  return (
    <BottomSheet open={props.open} title="保存到哪里" onClose={props.onClose}>
      <p className="text-ink-3 pb-3 text-center text-[12.5px]">只影响之后插入的图片和附件</p>
      <ServiceOption
        icon={<LocalTile />}
        name="这台手机"
        summary="离线可用，随资源文件同步到其他设备"
        current={active === LOCAL_UPLOAD_ID}
        onClick={props.onSelectLocal}
      />
      <p className="text-ink-3 px-1.5 pb-2 pt-4 text-[12px]">上传到云端，文档里直接引用网址</p>
      <div className="space-y-2">
        {UPLOAD_PROVIDERS.map(provider => (
          <ServiceOption
            key={provider.id}
            icon={<LetterTile letter={provider.tile.letter} className={provider.tile.className} />}
            name={provider.name}
            summary={
              provider.isConfigured(props.setting)
                ? provider.summary(props.setting) || "已配置"
                : "未配置"
            }
            current={provider.id === active}
            onClick={() => props.onOpenProvider(provider.id)}
          />
        ))}
      </div>
    </BottomSheet>
  );
}
