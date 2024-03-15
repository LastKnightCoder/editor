import React, { useState } from "react";
import classnames from 'classnames';

import SVG from 'react-inlinesvg';
import For from "@/components/For";

import { MdOutlineSettingsSuggest, MdOutlineDarkMode, MdOutlineLightMode } from "react-icons/md";
import card from '@/assets/icons/card.svg';
import article from '@/assets/icons/article.svg';
import documents from '@/assets/icons/documents.svg';
import daily from '@/assets/icons/daily.svg';
import timeRecord from '@/assets/icons/time-record.svg';
import logo from '@/assets/logo.svg';

import styles from './index.module.less';
import useSettingStore from "@/stores/useSettingStore";

enum EListItem {
  Card = 'card',
  Article = 'article',
  Documents = 'documents',
  Daily = 'daily',
  TimeRecord = 'timeRecord',
}

interface ListItem {
  key: EListItem;
  icon: React.ReactNode;
  label: string;
}

const list: ListItem[] = [{
  key: EListItem.Card,
  icon: <SVG src={card} />,
  label: '卡片',
}, {
  key: EListItem.Article,
  icon: <SVG src={article} />,
  label: '文章',
}, {
  key: EListItem.Documents,
  icon: <SVG src={documents} />,
  label: '知识库',
}, {
  key: EListItem.Daily,
  icon: <SVG src={daily} />,
  label: '日记',
}, {
  key: EListItem.TimeRecord,
  icon: <SVG src={timeRecord} />,
  label: '时间记录',
}];

const Sidebar = () => {
  const [activeItem, setActiveItem] = useState<EListItem>(EListItem.Card);

  const {
    darkMode,
    onDarkModeChange,
  } = useSettingStore(state => ({
    darkMode: state.setting.darkMode,
    onDarkModeChange: state.onDarkModeChange,
  }));

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.logo}>
        </div>
        <div className={styles.icons}>
          <div className={styles.theme}>
            {darkMode ? <MdOutlineLightMode onClick={() => onDarkModeChange(false)} /> : <MdOutlineDarkMode onClick={() => onDarkModeChange(true)} />}
          </div>
          <div className={styles.setting}>
            <MdOutlineSettingsSuggest />
          </div>
        </div>
      </div>
      <div className={styles.list}>
        <For data={list} renderItem={item => (
          <div
            key={item.key}
            className={classnames(styles.item, { [styles.active]: item.key === activeItem })}
            onClick={() => { setActiveItem(item.key) }}
          >
            {item.icon}
            <span>{item.label}</span>
          </div>
        )} />
      </div>
    </div>
  )
}

export default Sidebar;
