import { Outlet, Routes, Route } from 'react-router-dom';

import Sidebar from './components/Sidebar';
import Titlebar from '../components/Titlebar';
import CardTitlebar from './components/Titlebar/CardTitlebar';

import styles from './index.module.less';
import { useEffect } from 'react';
import useCardsManagementStore from '@/stores/useCardsManagementStore';

const ShortSidebarLayout = () => {

  useEffect(() => {
    useCardsManagementStore.getState().init();
  }, []);

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
    </div>
  )
}

export default ShortSidebarLayout;
