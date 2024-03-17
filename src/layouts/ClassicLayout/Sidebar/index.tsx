import { useMemo, useState, memo } from "react";
import { useLocation, useNavigate } from 'react-router-dom';

import SVG from 'react-inlinesvg';
import For from "@/components/For";
import LoadMoreComponent from "@/components/LoadMoreComponent";

import useSettingStore from "@/stores/useSettingStore";
import useCardsManagementStore from "@/stores/useCardsManagementStore";

import { generateCardTree } from "@/utils/card";

import { MdOutlineSettingsSuggest, MdOutlineDarkMode, MdOutlineLightMode, MdOutlineDocumentScanner } from "react-icons/md";
import card from '@/assets/icons/card.svg';
import article from '@/assets/icons/article.svg';
import document from '@/assets/icons/documents.svg';
import daily from '@/assets/icons/daily.svg';
import timeRecord from '@/assets/icons/time-record.svg';

import styles from './index.module.less';
import TagItem from "@/components/TagItem";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import If from "@/components/If";
import useDocumentsStore from "@/stores/useDocumentsStore";

enum EListItem {
  Cards = 'cards',
  Articles = 'articles',
  Documents = 'documents',
  Daily = 'daily',
  TimeRecord = 'timeRecord',
}

interface ISidebarProps {
  activeCardTag: string;
  onActiveCardTagChange: (tag: string) => void;
}

const Sidebar = memo((props: ISidebarProps) => {
  const { activeCardTag, onActiveCardTagChange } = props;

  const location = useLocation();
  const navigate = useNavigate();

  const [cardTreeOpen, setCardTreeOpen] = useState(false);
  const [cardTreeCount, setCardTreeCount] = useState(10);
  const { cards } = useCardsManagementStore(state => ({
    cards: state.cards,
  }));

  const cardTree = useMemo(() => {
    return generateCardTree(cards);
  }, [cards]);

  cardTree.sort((a, b) => b.cardIds.length - a.cardIds.length);

  const slicedCardTree = useMemo(() => {
    return cardTree.slice(0, cardTreeCount);
  }, [cardTree, cardTreeCount]);

  const onClickCardTreeTag = useMemoizedFn((tag: string) => {
    onActiveCardTagChange(tag);
    navigate(`/cards/`);
  });

  const loadMoreCardTree = useMemoizedFn(async () => {
    setCardTreeCount(Math.min(cardTreeCount + 10, cardTree.length));
  });

  const [documentListOpen, setDocumentListOpen] = useState(false);
  const {
    documents,
    activeDocumentId,
  } = useDocumentsStore(state => ({
    documents: state.documents,
    activeDocumentId: state.activeDocumentId,
  }));

  const activeItem = useMemo(() => {
    const pathname = location.pathname;
    return pathname.split('/')[1] as EListItem;
  }, [location.pathname]);

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
            {
              darkMode
                ? <MdOutlineLightMode onClick={() => onDarkModeChange(false)} />
                : <MdOutlineDarkMode onClick={() => onDarkModeChange(true)} />
            }
          </div>
          <div className={styles.setting} onClick={ () => { useSettingStore.setState({ settingModalOpen: true }) }} >
            <MdOutlineSettingsSuggest />
          </div>
        </div>
      </div>
      <div className={styles.list}>
        <div className={classnames(styles.item)}>
          <div
            className={classnames(styles.header, { [styles.active]: activeItem === EListItem.Cards })}
            onClick={() => {
              if (activeItem === EListItem.Cards) {
                setCardTreeOpen(!cardTreeOpen);
              } else {
                setCardTreeOpen(true);
              }
              navigate('/cards');
            }}
          >
            <SVG src={card} />
            <span>卡片</span>
          </div>
          <If condition={cardTreeOpen}>
            <LoadMoreComponent
              className={styles.children}
              onLoadMore={loadMoreCardTree}
              showLoader={cardTreeCount < cardTree.length}
            >
              <For
                data={slicedCardTree}
                renderItem={item => (
                  <TagItem
                    item={item}
                    key={item.tag}
                    onClickTag={onClickCardTreeTag}
                    activeTag={activeCardTag}
                  />
                )}
              />
            </LoadMoreComponent>
          </If>
        </div>
        <div className={styles.item}>
          <div
            className={classnames(styles.header, { [styles.active]: activeItem === EListItem.Articles })}
            onClick={() => {
              navigate('/articles');
            }}
          >
            <SVG src={article} />
            <span>文章</span>
          </div>
        </div>
        <div className={styles.item}>
          <div
            className={classnames(styles.header, { [styles.active]: activeItem === EListItem.Documents })}
            onClick={() => {
              if (activeItem === EListItem.Documents) {
                setDocumentListOpen(!documentListOpen);
              } else {
                setDocumentListOpen(true);
              }
              navigate('/documents');
            }}
          >
            <SVG src={document} />
            <span>知识库</span>
          </div>
          <If condition={documentListOpen}>
            <div className={styles.children}>
              <For
                data={documents}
                renderItem={document => (
                  <div
                    key={document.id}
                    className={classnames(styles.documentItem, { [styles.active]: document.id === activeDocumentId })}
                    onClick={() => {
                      navigate('/documents');
                      useDocumentsStore.setState({
                        activeDocumentId: document.id,
                      })
                      // 切换了不同的知识库，需要清空当前正在编辑的文档
                      if (activeDocumentId !== document.id) {
                        useDocumentsStore.setState({
                          activeDocumentItem: null,
                        });
                      }
                    }}
                  >
                    <div className={styles.icon}><MdOutlineDocumentScanner /></div>
                    <div className={styles.title}>{document.title}</div>
                  </div>
                )} />
            </div>
          </If>
        </div>
        <div className={styles.item}>
          <div
            className={classnames(styles.header, { [styles.active]: activeItem === EListItem.Daily })}
            onClick={() => {
              navigate('/daily');
            }}
          >
            <SVG src={daily} />
            <span>日记</span>
          </div>
        </div>
        <div className={styles.item}>
          <div
            className={classnames(styles.header, { [styles.active]: activeItem === EListItem.TimeRecord })}
            onClick={() => {
              navigate('/timeRecord');
            }}
          >
            <SVG src={timeRecord} />
            <span>时间记录</span>
          </div>
        </div>
      </div>
    </div>
  )
});

export default Sidebar;
