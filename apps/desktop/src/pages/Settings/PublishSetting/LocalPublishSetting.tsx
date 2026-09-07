import { produce } from "immer";

import useSettingStore from "@/stores/useSettingStore";
import { SettingInput } from "../components";

const LocalPublishSetting = () => {
  const { basePath } = useSettingStore(state => state.setting.publish.local);

  return (
    <div className="space-y-4">
      <SettingInput
        label="访问路径 (basePath)"
        placeholder="/ 或 /docs/"
        value={basePath}
        onChange={e => {
          useSettingStore.setState(
            produce(state => {
              state.setting.publish.local.basePath = e.target.value;
            })
          );
        }}
        description="用于生成站点内部链接的基础路径，通常保持 / 即可"
      />

      <div className="border-[var(--th-border-focus)]/30 dark:border-[var(--th-border-focus)]/20 rounded-lg border bg-[var(--th-accent-soft)] p-3 text-sm text-[var(--th-active-text)]">
        <p className="mb-1 font-medium">使用说明</p>
        <p>
          选择本地导出后，点击发布会提示选择输出文件夹，并生成完整的静态站点文件，方便你按自己的方式部署。
        </p>
      </div>
    </div>
  );
};

export default LocalPublishSetting;
