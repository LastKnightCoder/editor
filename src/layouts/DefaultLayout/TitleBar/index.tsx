import React, { useEffect, useState } from 'react';
import classnames from "classnames";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { CaretDownOutlined } from '@ant-design/icons';

import WindowControl from "@/components/WindowControl";

import styles from './index.module.less';
import { Popover } from "antd";

interface ITitleBarProps {
  className?: string;
  style?: React.CSSProperties;
}

enum ENavKey {
  CARDS = 'CARDS',
  ARTICLES = 'ARTICLES',
  DAILY = 'DAILY',
  DOCUMENTS = 'DOCUMENTS',
  STATISTIC = 'STATISTIC',
  TIME_RECORD = 'TIME_RECORD',
}

const TitleBar = (props: ITitleBarProps) => {
  const { className, style } = props;
  const [activeNavKey, setActiveNavKey] = useState<ENavKey>(ENavKey.CARDS);
  const [cardPopoverOpen, setCardPopoverOpen] = useState<boolean>(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const { pathname } = location;
    if (pathname.startsWith('/cards')) {
      setActiveNavKey(ENavKey.CARDS);
    } else if (pathname.startsWith('/articles')) {
      setActiveNavKey(ENavKey.ARTICLES);
    } else if (pathname.startsWith('/daily')) {
      setActiveNavKey(ENavKey.DAILY);
    } else if (pathname.startsWith('/documents')) {
      setActiveNavKey(ENavKey.DOCUMENTS);
    } else if (pathname.startsWith('/statistic')) {
      setActiveNavKey(ENavKey.STATISTIC);
    } else if (pathname.startsWith('/time-record')) {
      setActiveNavKey(ENavKey.TIME_RECORD);
    }
  }, [location]);

  const navigateToDaily = () => {
    navigate('/daily');
  }

  const navigateToArticles = () => {
    navigate('/articles/list');
  }

  const navigateToDocuments = () => {
    navigate('/documents');
  }

  const navigateToTimeRecord = () => {
    navigate('/time-record');
  }

  const isCardsActive = activeNavKey === ENavKey.CARDS;
  const isArticlesActive = activeNavKey === ENavKey.ARTICLES;
  const isDailyActive = activeNavKey === ENavKey.DAILY;
  const isDocumentsActive = activeNavKey === ENavKey.DOCUMENTS;
  const isTimeRecordActive = activeNavKey === ENavKey.TIME_RECORD;

  return (
    <div
      data-tauri-drag-region
      style={style}
      className={classnames(styles.titleBar, className)}
    >
      <motion.div className={styles.nav}>
        <Popover
          open={cardPopoverOpen}
          onOpenChange={setCardPopoverOpen}
          trigger={'click'}
          placement={'bottom'}
          overlayInnerStyle={{
            padding: 4,
          }}
          content={
            <div className={styles.dropCard}>
              <div
                className={styles.childItem}
                onClick={() => {
                  setCardPopoverOpen(false);
                  navigate('/cards/list')
                }}
              >
                卡片列表
              </div>
              <div
                className={styles.childItem}
                onClick={() => {
                  setCardPopoverOpen(false);
                  navigate('/cards/link-graph')
                }}>
                关系图谱
              </div>
            </div>
          }
        >
          <motion.div
            className={classnames(styles.item, { [styles.active]: isCardsActive })}
          >
            卡片 <CaretDownOutlined />
            {
              isCardsActive && <motion.div layoutId={'line'} className={styles.line}></motion.div>
            }
          </motion.div>
        </Popover>
        <motion.div
          className={classnames(styles.item, { [styles.active]: isArticlesActive })}
          onClick={navigateToArticles}
        >
          文章
          {
            isArticlesActive && <motion.div layoutId={'line'} className={styles.line}></motion.div>
          }
        </motion.div>
        <motion.div
          className={classnames(styles.item, { [styles.active]: isDocumentsActive })}
          onClick={navigateToDocuments}
        >
          知识库
          {
            isDocumentsActive && <motion.div layoutId={'line'} className={styles.line}></motion.div>
          }
        </motion.div>
        <motion.div
          className={classnames(styles.item, { [styles.active]: isDailyActive })}
          onClick={navigateToDaily}
        >
          日记
          {
            isDailyActive && <motion.div layoutId={'line'} className={styles.line}></motion.div>
          }
        </motion.div>
        <motion.div
          className={classnames(styles.item, { [styles.active]: isTimeRecordActive })}
          onClick={navigateToTimeRecord}
        >
          时间记录
          {
            isTimeRecordActive && <motion.div layoutId={'line'} className={styles.line}></motion.div>
          }
        </motion.div>
      </motion.div>
      <WindowControl className={styles.windowControl} />
    </div>
  )
}

export default TitleBar;