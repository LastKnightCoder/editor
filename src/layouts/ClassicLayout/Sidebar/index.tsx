import { useMemo, useState, memo } from "react";
import { useLocation, useNavigate } from 'react-router-dom';

import SVG from 'react-inlinesvg';
import For from "@/components/For";
import LoadMoreComponent from "@/components/LoadMoreComponent";

import useSettingStore from "@/stores/useSettingStore";
import useCardsManagementStore from "@/stores/useCardsManagementStore";

import { generateCardTree } from "@/utils/card";

import {
  MdOutlineSettingsSuggest,
  MdOutlineDarkMode,
  MdOutlineLightMode,
  MdOutlineDocumentScanner,
  MdKeyboardArrowRight,
} from "react-icons/md";
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
import useArticleManagementStore from "@/stores/useArticleManagementStore";
import useDailyNoteStore from "@/stores/useDailyNoteStore";
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import useProjectsStore from "@/stores/useProjectsStore";

enum EListItem {
  Cards = 'cards',
  Articles = 'articles',
  Documents = 'documents',
  Projects = 'projects',
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

  const {
    articles,
  } = useArticleManagementStore(state => ({
    articles: state.articles
  }))

  const [documentListOpen, setDocumentListOpen] = useState(false);
  const {
    documents,
    activeDocumentId,
  } = useDocumentsStore(state => ({
    documents: state.documents,
    activeDocumentId: state.activeDocumentId,
  }));

  const {
    dailyNotes,
  } = useDailyNoteStore(state => ({
    dailyNotes: state.dailyNotes,
  }));

  const {
    timeRecords,
  } = useTimeRecordStore(state => ({
    timeRecords: state.timeRecords,
  }));

  const {
    projects,
    activeProjectId,
  } = useProjectsStore(state => ({
    projects: state.projects,
    activeProjectId: state.activeProjectId,
  }))

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
        <div className={styles.item}>
          <div
            className={classnames(styles.header, { [styles.active]: activeItem === EListItem.Projects })}
            onClick={() => {
              navigate('/projects');
              useProjectsStore.setState({
                activeProjectId: null,
              })
            }}
          >
            <div className={styles.title}>
              <SVG src={document} />
              <span>项目</span>
              <div className={styles.count}>
                ({projects.length})
              </div>
            </div>
          </div>
          <div className={styles.children}>
            <For
              data={projects}
              renderItem={project => (
                <div
                  key={project.id}
                  className={classnames(styles.documentItem, { [styles.active]: project.id === activeProjectId })}
                  onClick={() => {
                    navigate('/projects');
                    useProjectsStore.setState({
                      activeProjectId: project.id,
                    });
                  }}
                >
                  <div className={styles.icon}><MdOutlineDocumentScanner /></div>
                  <div className={styles.title}>{project.title}</div>
                  <div className={styles.count}>({project.children.length})</div>
                </div>
              )}
            />
          </div>
        </div>
        <div className={classnames(styles.item)}>
          <div
            className={classnames(styles.header, { [styles.active]: activeItem === EListItem.Cards })}
            onClick={() => {
              onClickCardTreeTag('');
            }}
          >
            <div className={styles.title}>
              <SVG src={card} />
              <span>卡片</span>
              <div className={styles.count}>({cards.length})</div>
            </div>
            <div
              className={classnames(styles.arrow, { [styles.open]: cardTreeOpen })}
              onClick={(e) => {
                e.stopPropagation();
                setCardTreeOpen(!cardTreeOpen);
              }}
            >
              <MdKeyboardArrowRight />
            </div>
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
            <div className={styles.title}>
              <SVG src={article} />
              <span>文章</span>
              <div className={styles.count}>({articles.length})</div>
            </div>
          </div>
        </div>
        <div className={styles.item}>
          <div
            className={classnames(styles.header, { [styles.active]: activeItem === EListItem.Documents })}
            onClick={() => {
              navigate('/documents');
              useDocumentsStore.setState({
                activeDocumentId: null,
                activeDocumentItem: null,
              })
            }}
          >
            <div className={styles.title}>
              <SVG src={document} />
              <span>知识库</span>
              <div className={styles.count}>({documents.length}/{documents.reduce((count, doc) => doc.count + count, 0)})</div>
            </div>
            <div
              className={classnames(styles.arrow, { [styles.open]: documentListOpen })}
              onClick={(e) => {
                e.stopPropagation();
                setDocumentListOpen(!documentListOpen);
              }}
            >
              <MdKeyboardArrowRight />
            </div>
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
                      });
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
                    <div className={styles.count}>({document.count})</div>
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
            <div className={styles.title}>
              <SVG src={daily} />
              <span>日记</span>
              <div className={styles.count}>({dailyNotes.length})</div>
            </div>
          </div>
        </div>
        <div className={styles.item}>
          <div
            className={classnames(styles.header, { [styles.active]: activeItem === EListItem.TimeRecord })}
            onClick={() => {
              navigate('/timeRecord');
            }}
          >
            <div className={styles.title}>
              <SVG src={timeRecord} />
              <span>时间记录</span>
              <div className={styles.count}>
                ({timeRecords.map(timeRecord => timeRecord.timeRecords).flat().length})
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
});

export default Sidebar;
