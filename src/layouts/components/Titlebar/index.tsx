import { memo, useRef, useState } from 'react';
import { Outlet } from "react-router-dom";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";

import WindowControl from "@/components/WindowControl";
import PortalToBody from "@/components/PortalToBody";
import If from "@/components/If";
import { CloseOutlined } from "@ant-design/icons";

import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";

import styles from './index.module.less';

interface TitlebarProps {
  showColumns?: boolean;
  showSelectDatabase?: boolean;
  showFocusMode?: boolean;
}

const Titlebar = memo((props: TitlebarProps) => {
  const { showColumns, showSelectDatabase, showFocusMode } = props;
  const {
    focusMode,
  } = useGlobalStateStore(state => ({
    focusMode: state.focusMode,
  }));

  const timer = useRef<number>();

  const [showQuitFocus, setShowQuitFocus] = useState(false);

  const onMouseEnter = useMemoizedFn(() => {
    if (!focusMode) return;
    if (timer) {
      clearTimeout(timer.current);
    }
    setShowQuitFocus(true);
    timer.current = setTimeout(() => {
      setShowQuitFocus(false);
    }, 3000) as any;
  });

  const onMouseLeave = useMemoizedFn(() => {
    if (!focusMode) return;
    if (timer) {
      clearTimeout(timer.current);
    }
    setShowQuitFocus(false);
  })

  const handleQuitFocus = useMemoizedFn(() => {
    useGlobalStateStore.setState({
      focusMode: false,
    });
    setShowQuitFocus(false);
    if (timer) {
      clearTimeout(timer.current);
    }
  })

  return (
    <div
      data-tauri-drag-region
      className={styles.titleBar}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <If condition={focusMode}>
        <PortalToBody>
          <div className={classnames(styles.quitFocus, {
            [styles.show]: showQuitFocus
          })}>
            <div className={styles.quitIcon} onClick={handleQuitFocus}>
              <CloseOutlined style={{
                fontSize: 20,
              }} />
            </div>
          </div>
        </PortalToBody>
      </If>
      <If condition={!focusMode}>
        <Outlet />
      </If>
      <WindowControl className={styles.windowControl} showColumns={showColumns} showSelectDatabase={showSelectDatabase} showFocusMode={showFocusMode} />
    </div>
  )
});

export default Titlebar;