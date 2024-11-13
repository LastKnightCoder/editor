import { Outlet, Route, Routes } from 'react-router-dom';

import Titlebar from '../components/Titlebar';
import SettingModal from "../components/SettingModal";
import Sidebar from './components/Sidebar';
import CardTitlebar from './components/Titlebar/CardTitlebar';
import ArticleTitlebar from "./components/Titlebar/ArticleTitlebar";
import WhiteBoardTitlebar from "./components/Titlebar/WhiteBoardTitlebar";
import DocumentTitlebar from "./components/Titlebar/DocumentTitlebar";
import ProjectTitlebar from "./components/Titlebar/ProjectTitlebar";
import RightSidebar from "./components/RightSidebar";

import useChatMessageStore, { EStatus } from "@/stores/useChatMessageStore.ts";
import useInitDatabase from "@/hooks/useInitDatabase.ts";

import styles from './index.module.less';

const ShortSidebarLayout = () => {
  useInitDatabase();

  const {
    status
  } = useChatMessageStore(state => ({
    status: state.status
  }))

  return (
    <div className={styles.container}>
      <Sidebar className={styles.sidebar} />
      <div className={styles.content}>
        <div className={styles.titlebar}>
          <Routes>
            <Route path='/' element={<Titlebar showColumns={false} showSelectDatabase={true} showFocusMode={false} />}>
              <Route path="cards/*" element={<CardTitlebar />} />
              <Route path="articles/" element={<ArticleTitlebar />} />
              <Route path="white-boards/*" element={<WhiteBoardTitlebar />} />
              <Route path="documents/:id" element={<DocumentTitlebar />} />
              <Route path="projects/:id" element={<ProjectTitlebar />} />
              <Route path="*" element={<div />} />
            </Route>
          </Routes>
        </div>
        <div className={styles.main}>
          <div className={styles.mainContent}>
            <Outlet />
          </div>
          {
            status === EStatus.SUCCESS && (
              <RightSidebar />
            )
          }
        </div>
      </div>
      <SettingModal />
    </div>
  )
}

export default ShortSidebarLayout;
