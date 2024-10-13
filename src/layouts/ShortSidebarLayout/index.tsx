import { Outlet, Routes, Route } from 'react-router-dom';

import Titlebar from '../components/Titlebar';
import SettingModal from "../components/SettingModal";
import Sidebar from './components/Sidebar';
import CardTitlebar from './components/Titlebar/CardTitlebar';

import useInitDatabase from "@/hooks/useInitDatabase.ts";

import styles from './index.module.less';

const ShortSidebarLayout = () => {
  useInitDatabase();

  return (
    <div className={styles.container}>
      <Sidebar className={styles.sidebar} />
      <div className={styles.content}>
        <div className={styles.titlebar}>
          <Routes>
            <Route path='/' element={<Titlebar />}>
              <Route path="cards/*" element={<CardTitlebar />} />
              <Route path="*" element={<div />} />
            </Route>
          </Routes>
        </div>
        <div className={styles.main}>
          <Outlet />
        </div>
      </div>
      <SettingModal />
    </div>
  )
}

export default ShortSidebarLayout;
