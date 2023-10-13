import { InputNumber, Space, Input, Select } from "antd";
import {useMemo, useState} from "react";
import {produce} from "immer";

import { getAllFonts } from '@/commands';
import useSettingStore from "@/stores/useSettingStore.ts";

import styles from "./index.module.less";
import { useAsyncEffect } from "ahooks";


const FontSetting = () => {
  const {
    setting,
    onFontSettingChange,
  } = useSettingStore(state => ({
    setOpen: state.setSettingModalOpen,
    setting: state.setting,
    onFontSettingChange: state.onFontSettingChange,
  }));

  const [fonts, setFonts] = useState<string[]>([]);

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
      font.toLowerCase().includes('bold') ||
      font.toLowerCase().includes('semi')) ||
      font.toLowerCase().includes('thin')
    );
    // 去除掉 light regular bold 声明的字体
    setFonts(filterFonts);
  }, []);

  return (
    <div className={styles.settingGroup}>
      <Space>
        <div>中文字体：</div>
        <Select
          value={fontSetting.chineseFont}
          style={{
            width: 200,
          }}
          onChange={(font) => {
            onChineseFontChange(font as string);
          }}
          options={fonts.map(font => ({ label: font, value: font }))}
        />
      </Space>
      <Space>
        <div>英文字体：</div>
        <Select
          value={fontSetting.englishFont}
          style={{
            width: 200,
          }}
          onChange={(font) => {
            onEnglishFontChange(font as string);
          }}
          options={fonts.map(font => ({ label: font, value: font }))}
        />
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