import { produce } from "immer";
import { Info } from "lucide-react";
import { SettingRow, Radio, ROW_DIVIDER, Switch } from "@tau/ui";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
import { useDesktopPlugins } from "@/app/plugins/context";
import { LOCAL_UPLOAD_TARGET, selectUploadTarget } from "@/services/storage-providers";
import { SettingsGroup, SettingsNote } from "../components/SettingsGroup";
import { isProviderSection, ProviderChoiceList } from "../components/ProviderChoiceList";
import { StatusChip } from "../components/StatusChip";

export function ResourceSection() {
  const imageBed = useSettingStore(state => state.setting.imageBed);
  const runtime = useDesktopPlugins();
  const sections =
    runtime?.listSettings().filter(section => isProviderSection(section, "upload")) ?? [];
  const current =
    imageBed.active === EImageBed.Local ? LOCAL_UPLOAD_TARGET : (imageBed.plugin?.id ?? "");
  return (
    <>
      <SettingsGroup title="保存到" description="只影响之后插入的图片与附件，已插入的保留原地址">
        <ProviderChoiceList
          sections={sections}
          configurations={imageBed.plugin?.configurations}
          current={current}
          from="imageBed"
          addLabel="添加上传服务"
          onSelect={pluginId => selectUploadTarget(pluginId)}
          leading={name => (
            <div className={`flex min-h-14 items-center gap-3 px-3 py-2 ${ROW_DIVIDER}`}>
              <Radio
                name={name}
                value={LOCAL_UPLOAD_TARGET}
                checked={current === LOCAL_UPLOAD_TARGET}
                onChange={() => selectUploadTarget(LOCAL_UPLOAD_TARGET)}
                label={
                  <span className="text-tau-body-lg text-ink-1 inline-flex items-center gap-2 font-medium">
                    本地
                    {current === LOCAL_UPLOAD_TARGET && <StatusChip tone="accent">当前</StatusChip>}
                  </span>
                }
                description={
                  <span className="text-tau-meta text-ink-2">
                    应用目录的 resources 文件夹，随同步服务镜像到其他设备
                  </span>
                }
              />
            </div>
          )}
        />
      </SettingsGroup>
      <SettingsGroup title="处理">
        <SettingRow title="上传压缩" description="png / jpeg / jpg 保存前自动转为 webp">
          <Switch
            aria-label="上传压缩"
            checked={imageBed.enableCompression}
            onCheckedChange={value =>
              useSettingStore.setState(state => ({
                setting: produce(state.setting, draft => {
                  draft.imageBed.enableCompression = value;
                }),
              }))
            }
          />
        </SettingRow>
      </SettingsGroup>
      <SettingsNote icon={<Info size={14} />}>
        独立 Markdown 文件保留文档旁的本地保存规则；本地 resources 目录与云端的镜像在「同步 ·
        资源文件」中管理。
      </SettingsNote>
    </>
  );
}
