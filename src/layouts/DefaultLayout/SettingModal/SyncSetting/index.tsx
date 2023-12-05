import useSettingStore, { ESync } from "@/stores/useSettingStore.ts";
import { Tabs, TabsProps } from "antd";
import AliOssSetting from "./AliOssSetting";
import { produce } from "immer";

const SyncSetting = () => {
  const {
    activeKey
  } = useSettingStore(state => ({
    activeKey: state.setting.sync.active,
  }));

  const items: TabsProps['items'] = [{
    key: ESync.AliOSS,
    label: '阿里云 OSS',
    children: <AliOssSetting />,
  }]

  return (
    <Tabs
      activeKey={activeKey}
      onChange={(key) => {
        useSettingStore.setState(produce((draft) => {
          draft.setting.imageBed.active = key;
        }))
      }}
      items={items}
    />
  )
}

export default SyncSetting;
