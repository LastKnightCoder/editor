import { Tabs, TabsProps } from "antd";
import useSettingStore, { ELLMProvider } from "@/stores/useSettingStore.ts";
import OpenAISetting from "./OpenAISetting";
import OtherSetting from "./OtherSetting";
import { produce } from "immer";
import styles from "../common.module.less";

const LLMProviderSetting = () => {
  const { llmProviders } = useSettingStore((state) => ({
    llmProviders: state.setting.llmProviders,
  }));

  const { currentProvider } = llmProviders;

  const items: TabsProps["items"] = [
    {
      key: ELLMProvider.OPENAI,
      label: "Open AI",
      children: <OpenAISetting />,
    },
    {
      key: ELLMProvider.OTHER,
      label: "其他",
      children: <OtherSetting />,
    },
  ];

  const onCurKeyChange = (key: ELLMProvider) => {
    useSettingStore.setState(
      produce((draft) => {
        draft.setting.llmProviders.currentProvider = key;
      }),
    );
  };

  return (
    <Tabs
      activeKey={currentProvider}
      items={items}
      onChange={(key) => onCurKeyChange(key as ELLMProvider)}
      className={styles.settingTabs}
    />
  );
};

export default LLMProviderSetting;
