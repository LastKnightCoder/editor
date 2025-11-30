import useSettingStore from "@/stores/useSettingStore";
import {
  SettingContainer,
  SettingSection,
  SettingSwitch,
} from "../components";

const MiscSetting = () => {
  const { translateToChinese, setWebClipTranslateToChinese } = useSettingStore(
    (state) => ({
      translateToChinese: state.setting.misc.webClip.translateToChinese,
      setWebClipTranslateToChinese: state.setWebClipTranslateToChinese,
    }),
  );

  return (
    <SettingContainer>
      <SettingSection
        title="网页解析"
        description="配置网页剪藏文档的默认行为"
      >
        <SettingSwitch
          label="解析文档时翻译为中文"
          description="开启后，解析网页时将尝试自动翻译内容为中文"
          checked={translateToChinese}
          onChange={setWebClipTranslateToChinese}
        />
      </SettingSection>
    </SettingContainer>
  );
};

export default MiscSetting;
