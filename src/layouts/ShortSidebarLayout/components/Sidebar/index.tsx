import React from 'react';
import { useNavigate, useMatch } from 'react-router-dom';
import { HomeOutlined } from '@ant-design/icons';
import classnames from 'classnames';
import For from '@/components/For';
import { FiSidebar } from "react-icons/fi";
import SidebarItem from "./SidebarItem";
import { platform } from '@/electron.ts';

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

import SelectDatabase from "@/components/SelectDatabase";
import styles from './index.module.less';
import SVG from "react-inlinesvg";
import useCommandPanelStore from "@/stores/useCommandPanelStore.ts";
import { Flex } from "antd";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import useFullScreen from "@/hooks/useFullScreen.ts";
import If from "@/components/If";

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
  
  const {
    sidebarOpen,
  } = useGlobalStateStore(state => ({
    sidebarOpen: state.sidebarOpen,
  }));
  
  const isFullscreen = useFullScreen();
  const isMac = platform === 'darwin';
  
  const configs = [{
    key: 'home',
    icon: <HomeOutlined />,
    desc: '首页',
    path: '/',
    active: useMatch('/') !== null,
    enable: true,
  } ,{
    key: 'whiteBoard',
    icon: <SVG src={whiteBoard} /> ,
    desc: '白板',
    path: '/white-boards',
    active: useMatch('/white-boards') !== null,
    enable: module.whiteBoard.enable,
  }, {
    key: 'project',
    icon: <SVG src={document} /> ,
    desc: '项目',
    path: '/projects/list',
    active: useMatch('/projects/*') !== null,
    enable: module.project.enable,
  }, {
    key: 'card',
    icon: <SVG src={card} /> ,
    desc: '卡片',
    path: '/cards/list',
    active: useMatch('/cards/*') !== null,
    enable: module.card.enable,
  }, {
    key: 'article',
    icon: <SVG src={article} /> ,
    desc: '文章',
    path: '/articles',
    active: useMatch('/articles/*') !== null,
    enable: module.article.enable,
  }, {
    key: 'document',
    icon: <SVG src={document} />  ,
    desc: '知识库',
    path: '/documents',
    active: useMatch('/documents/*') !== null,
    enable: module.document.enable,
  }, {
    key: 'pdf',
    icon: <SVG src={pdf} /> ,
    desc: 'PDF',
    path: '/pdfs',
    active: useMatch('/pdfs/*') !== null,
    enable: module.pdf.enable,
  }, {
    key: 'vec-documents',
    icon: <SVG src={vecDatabase} /> ,
    desc: '向量数据库',
    path: '/vec-documents',
    active: useMatch('/vec-documents/*') !== null,
    enable: module.vecDocuments.enable,
  }, {
    key: 'daily',
    icon: <SVG src={daily}/>,
    desc:'日记',
    path: '/dailies',
    active: useMatch('/dailies/*') !== null,
    enable: module.dailyNote.enable,
    }, {
    key: 'timeRecord',
    icon: <SVG src={timeRecord} /> ,
    desc: '时间统计',
    path: '/time-records',
    active: useMatch('/time-records/*') !== null,
    enable: module.timeRecord.enable,
  }].filter(item => item.enable)

  const navigate = useNavigate();
  
  const handleHideSidebar = () => {
    useGlobalStateStore.setState({
      sidebarOpen: false,
    })
  }

  return (
    <div
      style={{
        width: sidebarOpen ? 200 : 60,
        height: '100%',
        boxSizing: "border-box",
        ...style,
      }}
      className={className}
    >
      <div className={classnames(styles.sidebar, { [styles.isShort]: !sidebarOpen })}>
        <div className={classnames(styles.header, { [styles.indent]: isMac && !isFullscreen })}>
          <SelectDatabase/>
          <div className={styles.icon} onClick={handleHideSidebar}>
            <FiSidebar/>
          </div>
        </div>
        <div className={classnames(styles.list, { [styles.isMac]: isMac && !isFullscreen })}>
          <If condition={sidebarOpen}>
            <div
              className={classnames(styles.search, { [styles.dark]: darkMode })}
              onClick={() => {
                useCommandPanelStore.setState({
                  open: true
                })
              }}
            >
              <Flex gap={8} align={'center'}>
                <svg width="20" height="20" viewBox="0 0 20 20" style={{ width: 14, height: 14, fontWeight: 700 }}>
                  <path
                    d="M14.386 14.386l4.0877 4.0877-4.0877-4.0877c-2.9418 2.9419-7.7115 2.9419-10.6533 0-2.9419-2.9418-2.9419-7.7115 0-10.6533 2.9418-2.9419 7.7115-2.9419 10.6533 0 2.9419 2.9418 2.9419 7.7115 0 10.6533z"
                    stroke="currentColor" fill="none" fillRule="evenodd" strokeLinecap="round"
                    strokeLinejoin="round"></path>
                </svg>
                <span>搜索</span>
              </Flex>
              <Flex align={'center'}>
                <kbd>
                  {isMac ? 'Cmd' : 'Ctrl'} + K
                </kbd>
              </Flex>
            </div>
          </If>
          <For
            data={configs}
            renderItem={item => (
              <SidebarItem
                key={item.key}
                icon={item.icon}
                label={item.desc}
                active={item.active}
                onClick={() => navigate(item.path)}
                isShortWidth={!sidebarOpen}
              />
            )}
          />
        </div>
        <div className={styles.setting}>
          <SidebarItem
            onClick={() => onDarkModeChange(!darkMode)}
            label={darkMode ? '浅色' : '深色'}
            icon={<SVG src={darkMode ? sun : moon}/>}
            active={false}
            isShortWidth={!sidebarOpen}
          />
          <SidebarItem
            onClick={() => {
              useSettingStore.setState({
                settingModalOpen: true
              })
            }}
            label={'设置'}
            icon={<SVG src={setting}/>}
            active={false}
            isShortWidth={!sidebarOpen}
          />
        </div>
      </div>
    </div>
  )
}

export default Sidebar;
