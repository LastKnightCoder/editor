import { useMemo, useState, memo } from "react";
import { useLocation, useNavigate } from 'react-router-dom';

import { Popover, App } from "antd";
import SVG from 'react-inlinesvg';
import For from "@/components/For";
import LoadMoreComponent from "@/components/LoadMoreComponent";
import TagItem from "@/components/TagItem";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import If from "@/components/If";
import SelectDatabase from '../components/SelectDatabase';
import ExpandList from "../components/ExpandList";

import { generateCardTree } from "@/utils/card";

import {
  MdOutlineSettingsSuggest,
  MdOutlineDarkMode,
  MdOutlineLightMode,
  MdOutlineDocumentScanner,
  MdMoreVert
} from "react-icons/md";
import card from '@/assets/icons/card.svg';
import article from '@/assets/icons/article.svg';
import document from '@/assets/icons/documents.svg';
import daily from '@/assets/icons/daily.svg';
import timeRecord from '@/assets/icons/time-record.svg';
import whiteBoard from '@/assets/icons/white-board.svg';
import pdf from '@/assets/icons/pdf.svg';

import useCardTree from "@/hooks/useCardTree";
import useSettingStore from "@/stores/useSettingStore";
import useCardsManagementStore from "@/stores/useCardsManagementStore";
import useDocumentsStore from "@/stores/useDocumentsStore";
import useArticleManagementStore from "@/stores/useArticleManagementStore";
import useDailyNoteStore from "@/stores/useDailyNoteStore";
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import useProjectsStore from "@/stores/useProjectsStore";
import usePdfsStore from "@/stores/usePdfsStore.ts";
import useWhiteBoardStore from "@/stores/useWhiteBoardStore";

import styles from './index.module.less';

enum EListItem {
  WhiteBoard = 'whiteBoard',
  Cards = 'cards',
  Articles = 'articles',
  Documents = 'documents',
  Projects = 'projects',
  Daily = 'daily',
  TimeRecord = 'timeRecord',
  Pdf = 'pdf'
}

const Sidebar = memo(() => {
  const { modal } = App.useApp();

  const location = useLocation();
  const navigate = useNavigate();

  const {
    slicedCardTree,
    cardTreeCount,
    loadMoreCardTree,
    cardTree
  } = useCardTree();

  const [cardTreeOpen, setCardTreeOpen] = useState(false);
  const { cards, activeCardTag } = useCardsManagementStore(state => ({
    cards: state.cards,
    activeCardTag: state.activeCardTag,
  }));

  const onClickCardTreeTag = useMemoizedFn((tag: string) => {
    useCardsManagementStore.setState({
      activeCardTag: tag
    })
    navigate(`/cards/`);
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
    pdfs,
  } = usePdfsStore(state => ({
    pdfs: state.pdfs
  }))

  const {
    projects,
    activeProjectId,
    archiveProject,
    deleteProject,
  } = useProjectsStore(state => ({
    projects: state.projects,
    activeProjectId: state.activeProjectId,
    archiveProject: state.archiveProject,
    deleteProject: state.deleteProject,
  }));

  const {
    whiteBoards,
  } = useWhiteBoardStore(state => ({
    whiteBoards: state.whiteBoards,
  }));

  const archivedProjects = useMemo(() => {
    return projects.filter(project => project.archived);
  }, [projects]);

  const activeProjects = useMemo(() => {
    return projects.filter(project => !project.archived);
  }, [projects]);

  const [projectListOpen, setProjectListOpen] = useState(false);
  const [archivedProjectListOpen, setArchivedProjectListOpen] = useState(false);

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
        <SelectDatabase />
        <div className={styles.icons}>
          <div className={styles.theme}>
            {
              darkMode
                ? <MdOutlineLightMode onClick={() => onDarkModeChange(false)} />
                : <MdOutlineDarkMode onClick={() => onDarkModeChange(true)} />
            }
          </div>
          <div className={styles.setting} onClick={() => { useSettingStore.setState({ settingModalOpen: true }) }} >
            <MdOutlineSettingsSuggest />
          </div>
        </div>
      </div>
      <div className={styles.list}>
        <ExpandList
          active={activeItem === EListItem.WhiteBoard}
          title={'白板'}
          expand={false}
          titleIcon={<SVG src={whiteBoard} />}
          count={whiteBoards.length}
          onClickTitle={() => {
            navigate('/whiteBoard');
          }}
          showArrow={false}
        />
        <ExpandList
          active={activeItem === EListItem.Projects}
          title={'项目'}
          expand={projectListOpen}
          titleIcon={<SVG src={document} />}
          count={projects.length}
          onClickTitle={() => {
            navigate('/projects');
            useProjectsStore.setState({
              activeProjectId: null,
            })
          }}
          onClickArrow={(e) => {
            e.stopPropagation();
            setProjectListOpen(!projectListOpen);
          }}
        >
          <div className={styles.children}>
            <For
              data={activeProjects}
              renderItem={project => (
                <div
                  key={project.id}
                  className={classnames(styles.childItem, { [styles.active]: project.id === activeProjectId })}
                >
                  <ExpandList
                    showArrow={false}
                    active={project.id === activeProjectId}
                    title={project.title}
                    expand={false}
                    count={project.children.length}
                    onClickTitle={() => {
                      navigate('/projects');
                      useProjectsStore.setState({
                        activeProjectId: project.id,
                      });
                    }}
                    titleIcon={(
                      <div className={styles.icon}>
                        <MdOutlineDocumentScanner />
                      </div>
                    )}
                    extra={(
                      <div className={styles.icon}>
                        <Popover
                          trigger={'hover'}
                          content={(
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4
                              }}
                            >
                              <div
                                className={styles.contextItem}
                                onClick={() => {
                                  archiveProject(project.id);
                                }}
                              >
                                归档项目
                              </div>
                              <div
                                className={styles.contextItem}
                                onClick={() => {
                                  modal.confirm({
                                    title: '确认删除项目？',
                                    content: '删除项目后，将无法恢复。',
                                    okText: '确认',
                                    cancelText: '取消',
                                    okButtonProps: {
                                      danger: true,
                                    },
                                    onOk: async () => {
                                      await deleteProject(project.id);
                                      if (activeProjectId === project.id) {
                                        useProjectsStore.setState({
                                          activeProjectId: null,
                                          activeProjectItemId: null,
                                        });
                                      }
                                    }
                                  })

                                }}
                              >
                                删除项目
                              </div>
                            </div>
                          )}
                          arrow={false}
                          placement={'rightTop'}
                        >
                          <MdMoreVert />
                        </Popover>
                      </div>
                    )}
                  />
                </div>
              )}
            />
            <If condition={archivedProjects.length > 0}>
              <div className={styles.childItem}>
                <ExpandList
                  active={!!activeProjectId && archivedProjects.map(project => project.id).includes(activeProjectId)}
                  title={'归档'}
                  expand={archivedProjectListOpen}
                  titleIcon={(
                    <div
                      className={styles.icon}><MdOutlineDocumentScanner /></div>
                  )}
                  count={archivedProjects.length}
                  onClickArrow={(e) => {
                    e.stopPropagation();
                    setArchivedProjectListOpen(!archivedProjectListOpen);
                  }}
                >
                  <For
                    data={archivedProjects}
                    renderItem={project => (
                      <div
                        key={project.id}
                        className={classnames(styles.childItem, { [styles.active]: project.id === activeProjectId })}
                      >
                        <ExpandList
                          showArrow={false}
                          active={project.id === activeProjectId}
                          title={project.title}
                          expand={false}
                          count={project.children.length}
                          onClickTitle={() => {
                            navigate('/projects');
                            useProjectsStore.setState({
                              activeProjectId: project.id,
                            });
                          }}
                          titleIcon={(
                            <div
                              className={styles.icon}><MdOutlineDocumentScanner /></div>
                          )}
                        />
                      </div>
                    )}
                  />
                </ExpandList>
              </div>
            </If>
          </div>
        </ExpandList>
        <ExpandList
          active={activeItem === EListItem.Cards}
          title={'卡片'}
          expand={cardTreeOpen}
          titleIcon={<SVG src={card} />}
          count={cards.length}
          onClickTitle={() => {
            onClickCardTreeTag('');
          }}
          onClickArrow={(e) => {
            e.stopPropagation();
            setCardTreeOpen(!cardTreeOpen);
          }}
        >
          <div className={styles.children}>
            <LoadMoreComponent
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
          </div>

        </ExpandList>
        <ExpandList
          active={activeItem === EListItem.Articles}
          title={'文章'}
          expand={false}
          titleIcon={<SVG src={article} />}
          count={articles.length}
          onClickTitle={() => {
            navigate('/articles');
          }}
          showArrow={false}
        />
        <ExpandList
          active={activeItem === EListItem.Pdf}
          title={'PDF'}
          expand={false}
          titleIcon={<SVG src={pdf} />}
          count={pdfs.length}
          onClickTitle={() => {
            navigate('/pdf');
          }}
          showArrow={false}
        />
        <ExpandList
          active={activeItem === EListItem.Documents}
          title={'知识库'}
          expand={documentListOpen}
          titleIcon={<SVG src={document} />}
          onClickTitle={() => {
            navigate('/documents');
            useDocumentsStore.setState({
              activeDocumentId: null,
              activeDocumentItem: null,
            })
          }}
          onClickArrow={(e) => {
            e.stopPropagation();
            setDocumentListOpen(!documentListOpen);
          }}
          count={`${documents.length}/${documents.reduce((count, doc) => doc.count + count, 0)}`}
        >
          <div className={styles.children}>
            <For
              data={documents}
              renderItem={document => (
                <div
                  key={document.id}
                  className={classnames(styles.childItem, { [styles.active]: document.id === activeDocumentId })}
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
        </ExpandList>
        <ExpandList
          active={activeItem === EListItem.Daily}
          title={'日记'}
          expand={false}
          titleIcon={<SVG src={daily} />}
          count={dailyNotes.length}
          onClickTitle={() => {
            navigate('/daily');
          }}
          showArrow={false}
        />
        <ExpandList
          active={activeItem === EListItem.TimeRecord}
          title={'时间记录'}
          expand={false}
          titleIcon={<SVG src={timeRecord} />}
          count={timeRecords.map(timeRecord => timeRecord.timeRecords).flat().length}
          onClickTitle={() => {
            navigate('/timeRecord');
          }}
          showArrow={false}
        />
      </div>
    </div>
  )
});

export default Sidebar;
