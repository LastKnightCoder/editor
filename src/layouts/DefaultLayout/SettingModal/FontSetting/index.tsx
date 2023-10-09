import {InputNumber, Space, Input} from "antd";
import { useMemo } from "react";
import {produce} from "immer";

import { getAllFonts } from '@/commands';
import useSettingStore from "@/stores/useSettingStore.ts";

import styles from "./index.module.less";
import {useAsyncEffect} from "ahooks";


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

  useAsyncEffect(async () => {
    const fonts = await getAllFonts();
    const filterFonts = fonts.filter(font => !(
      font.toLowerCase().includes('light') ||
      font.toLowerCase().includes('regular') ||
      font.toLowerCase().includes('bold') ||
      font.toLowerCase().includes('semi'))
    );
    // 去除掉 light regular bold 声明的字体
    console.log(filterFonts);
  }, []);

  return (
    <div className={styles.settingGroup}>
      <Space>
        <div>中文字体：</div>
        <Input value={fontSetting.chineseFont} onChange={(e) => { onChineseFontChange(e.target.value) }} />
      </Space>
      <Space>
        <div>英文字体：</div>
        <Input value={fontSetting.englishFont} onChange={(e) => { onEnglishFontChange(e.target.value) }} />
      </Space>
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