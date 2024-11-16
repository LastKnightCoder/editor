import React from 'react';
import { useNavigate, useMatch } from 'react-router-dom';
import classnames from 'classnames';
import IconText from '@/components/IconText';
import For from '@/components/For';

import useSettingStore from "@/stores/useSettingStore.ts";

import card from '@/assets/icons/card.svg';
import article from '@/assets/icons/article.svg';
import document from '@/assets/icons/documents.svg';
import daily from '@/assets/icons/daily.svg';
import timeRecord from '@/assets/icons/time-record.svg';
import whiteBoard from '@/assets/icons/white-board.svg';
import pdf from '@/assets/icons/pdf.svg';
import setting from '@/assets/icons/setting.svg';
import sun from '@/assets/icons/sun.svg';
import moon from '@/assets/icons/moon.svg';
import vecDatabase from '@/assets/icons/vec-database.svg';

import styles from './index.module.less';

interface SidebarProps {
  className?: string;
  style?: React.CSSProperties;
}

const Sidebar = (props: SidebarProps) => {
  const { className, style } = props;

  const {
    darkMode,
    onDarkModeChange,
    module,
  } = useSettingStore(state => ({
    darkMode: state.setting.darkMode,
    onDarkModeChange: state.onDarkModeChange,
    module: state.setting.module,
  }));

  const configs = [{
    key: 'whiteBoard',
    icon: whiteBoard,
    desc: '白板',
    path: '/white-boards',
    active: useMatch('/white-boards') !== null,
    enable: module.whiteBoard.enable,
  }, {
    key: 'project',
    icon: document,
    desc: '项目',
    path: '/projects/list',
    active: useMatch('/projects/*') !== null,
    enable: module.project.enable,
  }, {
    key: 'card',
    icon: card,
    desc: '卡片',
    path: '/cards/list',
    active: useMatch('/cards/*') !== null,
    enable: module.card.enable,
  }, {
    key: 'article',
    icon: article,
    desc: '文章',
    path: '/articles',
    active: useMatch('/articles/*') !== null,
    enable: module.article.enable,
  }, {
    key: 'document',
    icon: document,
    desc: '知识库',
    path: '/documents',
    active: useMatch('/documents/*') !== null,
    enable: module.document.enable,
  }, {
    key: 'pdf',
    icon: pdf,
    desc: 'PDF',
    path: '/pdfs',
    active: useMatch('/pdfs/*') !== null,
    enable: module.pdf.enable,
  }, {
    key: 'vec-documents',
    icon: vecDatabase,
    desc: '向量数据库',
    path: '/vec-documents',
    active: useMatch('/vec-documents/*') !== null,
    enable: module.vecDocuments.enable,
  }, {
    key: 'daily',
    icon: daily,
    desc:'日记',
    path: '/dailies',
    active: useMatch('/dailies/*') !== null,
    enable: module.dailyNote.enable,
    }, {
    key: 'timeRecord',
    icon: timeRecord,
    desc: '时间统计',
    path: '/time-records',
    active: useMatch('/time-records/*') !== null,
    enable: module.timeRecord.enable,
  }].filter(item => item.enable)

  const navigate = useNavigate();

  return (
    <div className={classnames(styles.sidebar, className)} style={style}>
      <div className={styles.list}>
        <For 
          data={configs} 
          renderItem={item => (
            <IconText
              key={item.key}
              icon={item.icon}
              text={item.desc}
              active={item.active}
              onClick={() => navigate(item.path)}
            />
          )}
        />
      </div>
      <div className={styles.setting}>
          <IconText
            icon={darkMode ? sun : moon}
            text={darkMode ? '浅色' : '深色'}
            onClick={() => onDarkModeChange(!darkMode)}
          />
          <IconText
            icon={setting}
            text={'设置'}
            onClick={() => {
              useSettingStore.setState({ settingModalOpen: true })
            }}
            style={{
              marginTop: 12
            }}
          />
      </div>
    </div>
  )
}

export default Sidebar;
