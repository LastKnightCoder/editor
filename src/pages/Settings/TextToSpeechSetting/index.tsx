import useSettingStore from "@/stores/useSettingStore.ts";
import DoubaoSetting from "./DoubaoSetting";
import { Tabs, TabsProps } from "antd";
import { produce } from "immer";
import styles from "../common.module.less";

const TextSpeechSetting = () => {
  const { currentModel } = useSettingStore((state) => ({
    currentModel: state.setting.textToSpeech.currentModel,
  }));

  const tabs: TabsProps["items"] = [
    {
      label: "豆包",
      key: "doubao",
      children: <DoubaoSetting />,
    },
  ];

  return (
    <Tabs
      activeKey={currentModel}
      onChange={(key) => {
        useSettingStore.setState(
          produce((draft) => {
            draft.setting.textToSpeech.currentModel = key;
          }),
        );
      }}
      items={tabs}
      className={styles.settingTabs}
    />
  );
};

export default TextSpeechSetting;
