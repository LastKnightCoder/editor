import useSettingStore from "@/stores/useSettingStore";
import DoubaoSetting from "./DoubaoSetting";
import { produce } from "immer";
import { SettingContainer, SettingSection, SettingTabs } from "../components";

const TextSpeechSetting = () => {
  const { currentModel } = useSettingStore((state) => ({
    currentModel: state.setting.textToSpeech.currentModel,
  }));

  const tabItems = [{ key: "doubao", label: "豆包" }];

  const renderContent = () => {
    switch (currentModel) {
      case "doubao":
        return <DoubaoSetting />;
      default:
        return <DoubaoSetting />;
    }
  };

  return (
    <SettingContainer>
      <SettingSection
        title="语音合成服务"
        description="配置文本转语音服务提供商"
      >
        <SettingTabs
          activeKey={currentModel}
          onChange={(key) => {
            useSettingStore.setState(
              produce((draft) => {
                draft.setting.textToSpeech.currentModel = key;
              }),
            );
          }}
          items={tabItems}
        />

        <div className="mt-6">{renderContent()}</div>
      </SettingSection>
    </SettingContainer>
  );
};

export default TextSpeechSetting;
