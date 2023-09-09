import {InputNumber, Space} from "antd";
import {useEffect, useMemo} from "react";
import {produce} from "immer";

import useSettingStore from "@/stores/useSettingStore.ts";

import InputItem from "../InputItem";
import styles from "./index.module.less";


const FontSetting = () => {
  const {
    setting,
    onFontSettingChange,
  } = useSettingStore(state => ({
    setOpen: state.setSettingModalOpen,
    setting: state.setting,
    onFontSettingChange: state.onFontSettingChange,
  }));

  const fontSetting = useMemo(() => {
    return setting.fontSetting;
  }, [setting]);

  useEffect(() => {
    const { chineseFont, englishFont, fontSize } = fontSetting;
    const font = `${englishFont}, ${chineseFont}`;
    document.body.style.setProperty('--font', font);
    document.body.style.setProperty('--font-size', `${fontSize}px`);
  }, [fontSetting]);

  const onChineseFontChange = (font: string) => {
    onFontSettingChange(produce(fontSetting, draft => {
      draft.chineseFont = font;
    }));
  }

  const onEnglishFontChange = (font: string) => {
    onFontSettingChange(produce(fontSetting, draft => {
      draft.englishFont = font;
    }));
  }

  const onFontSizeChange = (size: number) => {
    onFontSettingChange(produce(fontSetting, draft => {
      draft.fontSize = size;
    }));
  }

  return (
    <div className={styles.settingGroup}>
      <InputItem label={'中文字体：'} value={fontSetting.chineseFont} onChange={onChineseFontChange} />
      <InputItem label={'英文字体：'} value={fontSetting.englishFont} onChange={onEnglishFontChange} />
      <Space>
        <div>字体大小：</div>
        <InputNumber
          min={12}
          controls={false}
          value={fontSetting.fontSize}
          type={'number'}
          onChange={(size) => {
            onFontSizeChange(size as number);
          }}
        />
      </Space>
    </div>
  )
}

export default FontSetting;