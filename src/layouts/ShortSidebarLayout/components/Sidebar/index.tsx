import React, { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useNavigate, matchPath, useLocation } from "react-router-dom";
import classnames from "classnames";
import For from "@/components/For";
import SidebarItem from "./SidebarItem";
import { platform } from "@/electron.ts";

import useSettingStore from "@/stores/useSettingStore.ts";

import home from "@/assets/icons/home.svg";
import card from "@/assets/icons/card.svg";
import article from "@/assets/icons/article.svg";
import document from "@/assets/icons/documents.svg";
import daily from "@/assets/icons/daily.svg";
import timeRecord from "@/assets/icons/time-record.svg";
import whiteBoard from "@/assets/icons/white-board.svg";
import pdf from "@/assets/icons/pdf.svg";
import setting from "@/assets/icons/setting.svg";
import sun from "@/assets/icons/sun.svg";
import moon from "@/assets/icons/moon.svg";
import vecDatabase from "@/assets/icons/vec-database.svg";
import sidebarLeft from "@/assets/icons/sidebar-left.svg";

import SelectDatabase from "@/components/SelectDatabase";
import styles from "./index.module.less";
import SVG from "react-inlinesvg";
import useCommandPanelStore from "@/stores/useCommandPanelStore.ts";
import { Flex } from "antd";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import useFullScreen from "@/hooks/useFullScreen.ts";
import If from "@/components/If";
import TitlebarIcon from "@/components/TitlebarIcon";
import { useMemoizedFn, useWhyDidYouUpdate } from "ahooks";

interface SidebarProps {
  className?: string;
  style?: React.CSSProperties;
}

const Sidebar = (props: SidebarProps) => {
  const { className, style } = props;

  const { darkMode, onDarkModeChange, module } = useSettingStore(
    useShallow((state) => ({
      darkMode: state.setting.darkMode,
      onDarkModeChange: state.onDarkModeChange,
      module: state.setting.module,
    })),
  );

  const { sidebarOpen } = useGlobalStateStore(
    useShallow((state) => ({
      sidebarOpen: state.sidebarOpen,
    })),
  );

  const navigate = useNavigate();
  const path = useLocation();

  const isFullscreen = useFullScreen();
  const isMac = platform === "darwin";

  const navigateToHome = useMemoizedFn(() => {
    navigate("/");
  });

  const navigateToWhiteBoard = useMemoizedFn(() => {
    navigate("/white-boards");
  });

  const navigateToProjects = useMemoizedFn(() => {
    navigate("/projects/list");
  });

  const navigateToCards = useMemoizedFn(() => {
    navigate("/cards/list");
  });

  const navigateToArticles = useMemoizedFn(() => {
    navigate("/articles");
  });

  const navigateToDocuments = useMemoizedFn(() => {
    navigate("/documents");
  });

  const navigateToPDFs = useMemoizedFn(() => {
    navigate("/pdfs");
  });

  const navigateToVecDocuments = useMemoizedFn(() => {
    navigate("/vec-documents");
  });

  const navigateToDailies = useMemoizedFn(() => {
    navigate("/dailies");
  });

  const navigateToTimeRecords = useMemoizedFn(() => {
    navigate("/time-records");
  });

  const navigateToSettings = useMemoizedFn(() => {
    navigate("/settings");
  });

  const darkModeChange = useMemoizedFn(() => {
    onDarkModeChange(!darkMode);
  });

  const configs = useMemo(() => {
    return [
      {
        key: "home",
        icon: home,
        desc: "首页",
        path: "/",
        active: matchPath("/", path.pathname) !== null,
        enable: true,
        onClick: navigateToHome,
      },
      {
        key: "whiteBoard",
        icon: whiteBoard,
        desc: "白板",
        path: "/white-boards",
        active: matchPath("/white-boards", path.pathname) !== null,
        enable: module.whiteBoard.enable,
        onClick: navigateToWhiteBoard,
      },
      {
        key: "project",
        icon: document,
        desc: "项目",
        path: "/projects/list",
        active: matchPath("/projects/*", path.pathname) !== null,
        enable: module.project.enable,
        onClick: navigateToProjects,
      },
      {
        key: "card",
        icon: card,
        desc: "卡片",
        path: "/cards/list",
        active: matchPath("/cards/*", path.pathname) !== null,
        enable: module.card.enable,
        onClick: navigateToCards,
      },
      {
        key: "article",
        icon: article,
        desc: "文章",
        path: "/articles",
        active: matchPath("/articles/*", path.pathname) !== null,
        enable: module.article.enable,
        onClick: navigateToArticles,
      },
      {
        key: "document",
        icon: document,
        desc: "知识库",
        path: "/documents",
        active: matchPath("/documents/*", path.pathname) !== null,
        enable: module.document.enable,
        onClick: navigateToDocuments,
      },
      {
        key: "pdf",
        icon: pdf,
        desc: "PDF",
        path: "/pdfs",
        active: matchPath("/pdfs/*", path.pathname) !== null,
        enable: module.pdf.enable,
        onClick: navigateToPDFs,
      },
      {
        key: "vec-documents",
        icon: vecDatabase,
        desc: "向量数据库",
        path: "/vec-documents",
        active: matchPath("/vec-documents/*", path.pathname) !== null,
        enable: module.vecDocuments.enable,
        onClick: navigateToVecDocuments,
      },
      {
        key: "daily",
        icon: daily,
        desc: "日记",
        path: "/dailies",
        active: matchPath("/dailies/*", path.pathname) !== null,
        enable: module.dailyNote.enable,
        onClick: navigateToDailies,
      },
      {
        key: "timeRecord",
        icon: timeRecord,
        desc: "时间统计",
        path: "/time-records",
        active: matchPath("/time-records/*", path.pathname) !== null,
        enable: module.timeRecord.enable,
        onClick: navigateToTimeRecords,
      },
    ].filter((item) => item.enable);
  }, [module, navigate, path.pathname]);

  const handleHideSidebar = useMemoizedFn(() => {
    useGlobalStateStore.setState({
      sidebarOpen: false,
    });
  });

  useWhyDidYouUpdate("Sidebar", {
    sidebarOpen,
    darkMode,
    module,
    isMac,
    isFullscreen,
    path,
    configs,
    navigate,
    onDarkModeChange,
    ...props,
  });

  return (
    <div
      style={{
        width: sidebarOpen ? 200 : 60,
        height: "100%",
        boxSizing: "border-box",
        ...style,
      }}
      className={className}
    >
      <div
        className={classnames(styles.sidebar, {
          [styles.isShort]: !sidebarOpen,
        })}
      >
        <div
          className={classnames(styles.header, {
            [styles.indent]: isMac && !isFullscreen,
          })}
        >
          <SelectDatabase />
          <TitlebarIcon onClick={handleHideSidebar}>
            <SVG src={sidebarLeft} />
          </TitlebarIcon>
        </div>
        <div
          className={classnames(styles.list, {
            [styles.isMac]: isMac && !isFullscreen,
          })}
        >
          <If condition={sidebarOpen}>
            <div
              className={classnames(styles.search, { [styles.dark]: darkMode })}
              onClick={() => {
                useCommandPanelStore.setState({
                  open: true,
                });
              }}
            >
              <Flex gap={8} align={"center"}>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  style={{ width: 14, height: 14, fontWeight: 700 }}
                >
                  <path
                    d="M14.386 14.386l4.0877 4.0877-4.0877-4.0877c-2.9418 2.9419-7.7115 2.9419-10.6533 0-2.9419-2.9418-2.9419-7.7115 0-10.6533 2.9418-2.9419 7.7115-2.9419 10.6533 0 2.9419 2.9418 2.9419 7.7115 0 10.6533z"
                    stroke="currentColor"
                    fill="none"
                    fillRule="evenodd"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  ></path>
                </svg>
                <span>搜索</span>
              </Flex>
              <Flex align={"center"}>
                <kbd>{isMac ? "Cmd" : "Ctrl"} + K</kbd>
              </Flex>
            </div>
          </If>
          <For
            data={configs}
            renderItem={(item) => (
              <SidebarItem
                key={item.key}
                icon={item.icon}
                label={item.desc}
                active={item.active}
                onClick={item.onClick}
                isShortWidth={!sidebarOpen}
              />
            )}
          />
        </div>
        <div className={styles.setting}>
          <SidebarItem
            onClick={darkModeChange}
            label={darkMode ? "浅色" : "深色"}
            icon={darkMode ? sun : moon}
            active={false}
            isShortWidth={!sidebarOpen}
          />
          <SidebarItem
            onClick={navigateToSettings}
            label={"设置"}
            icon={setting}
            active={false}
            isShortWidth={!sidebarOpen}
          />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
