import PodcastTTSSetting from "./PodcastTTSSetting";
import { SettingContainer, SettingSection } from "../components";

const TextSpeechSetting = () => {
  return (
    <SettingContainer>
      <SettingSection title="语音合成服务" description="配置文本转语音的服务提供商">
        <PodcastTTSSetting />
      </SettingSection>
    </SettingContainer>
  );
};

export default TextSpeechSetting;
