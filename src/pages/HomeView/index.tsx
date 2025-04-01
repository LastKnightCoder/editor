import { Card, Statistic, Row, Col, Popover } from "antd";
import { useShallow } from "zustand/react/shallow";
import styles from "./index.module.less";
import { useEffect, useState, memo } from "react";
import {
  getAllDocumentItems,
  getAllProjectItems,
  getLatestOperations,
  getRootDocumentsByDocumentItemId,
  getAllCards,
  getAllArticles,
} from "@/commands";
import { IArticle, ICard, IDocumentItem, ProjectItem } from "@/types";
import useSettingStore from "@/stores/useSettingStore.ts";
import For from "@/components/For";
import { getEditorText } from "@/utils";
import Editor from "@editor/index.tsx";
import { useNavigate } from "react-router-dom";
import useProjectsStore from "@/stores/useProjectsStore.ts";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import CalendarHeatmap, { IItem } from "@/components/CalendarHeatmap";
import { getCalendarHeatmap, getAllStatistic } from "@/commands";
import dayjs from "dayjs";
import { Line } from "@ant-design/charts";
import useTheme from "@/hooks/useTheme.ts";
import { useMemoizedFn } from "ahooks";
import ContainerCol from "@/components/ContainerCol";
import Titlebar from "@/layouts/components/Titlebar";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import {
  fileAttachmentExtension,
  cardLinkExtension,
  projectCardListExtension,
  documentCardListExtension,
} from "@/editor-extensions";

const customExtensions = [
  fileAttachmentExtension,
  cardLinkExtension,
  projectCardListExtension,
  documentCardListExtension,
];

const HomeView = memo(() => {
  const navigate = useNavigate();

  const { isDark } = useTheme();

  const isConnected = useDatabaseConnected();

  const [notesLineData, setNotesLineData] = useState<
    {
      date: string;
      type: string;
      count: number;
      wordsCount: number;
    }[]
  >([]);

  const [operationData, setOperationData] = useState<IItem[]>([]);

  const [documentItems, setDocumentItems] = useState<IDocumentItem[]>([]);
  const [documentItemWordCounts, setDocumentItemWordCounts] = useState(0);

  const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
  const [projectItemWordCounts, setProjectItemWordCounts] = useState(0);

  const [latestOperations, setLatestOperations] = useState({
    cards: [] as ICard[],
    articles: [] as IArticle[],
    projectItems: [] as ProjectItem[],
    documentItems: [] as IDocumentItem[],
  });

  const active = useSettingStore(
    useShallow((state) => state.setting.database.active),
  );

  const [cards, setCards] = useState<ICard[]>([]);
  const [articles, setArticles] = useState<IArticle[]>([]);
  const [cardWordCounts, setCardWordCounts] = useState(0);
  const [articleWordCounts, setArticleWordCounts] = useState(0);

  const initData = useMemoizedFn(() => {
    getAllCards().then((cards) => {
      setCards(cards);
      setCardWordCounts(
        cards.reduce((acc, card) => {
          return acc + card.count;
        }, 0),
      );
    });
    getAllArticles().then((articles) => {
      setArticles(articles);
      setArticleWordCounts(
        articles.reduce((acc, article) => {
          return acc + article.count;
        }, 0),
      );
    });

    getAllDocumentItems().then((items) => {
      setDocumentItems(items);
      setDocumentItemWordCounts(
        items.reduce((acc, item) => {
          return acc + item.count;
        }, 0),
      );
    });

    getAllProjectItems().then((items) => {
      setProjectItems(items);
      setProjectItemWordCounts(
        items.reduce((acc, item) => {
          return acc + item.count;
        }, 0),
      );
    });

    getLatestOperations(5).then((operations) => {
      setLatestOperations(operations);
    });

    getCalendarHeatmap(dayjs().year()).then((data) => {
      setOperationData(
        data.map((item) => ({
          date: item.time,
          count: item.operation_list.length,
          operationList: item.operation_list,
        })),
      );
    });

    getAllStatistic().then((data) => {
      const notesLineData = data.map((item) => ({
        date: item.date,
        type: item.statisticType,
        count: item.content.count,
        wordsCount: item.content.wordsCount,
      }));
      setNotesLineData(notesLineData);
    });
  });

  useEffect(() => {
    if (!isConnected || !active) return;
    initData();
  }, [isConnected, active, initData]);

  return (
    <div className={styles.container}>
      <Titlebar className={styles.titlebar}>
        <div />
      </Titlebar>
      <div className={styles.content}>
        <h2>数据总览</h2>
        <CalendarHeatmap
          className={styles.calendar}
          data={operationData}
          year={dayjs().format("YYYY")}
          renderTooltip={(date) => {
            return date;
          }}
        />
        <Row gutter={[16, 16]}>
          <ContainerCol xs={24} md={12} lg={12} xl={8} xxl={6}>
            <Card title={"卡片"}>
              <Row>
                <Col span={12}>
                  <Statistic title={"数量"} value={cards.length} />
                </Col>
                <Col span={12}>
                  <Statistic title={"总字数"} value={cardWordCounts} />
                </Col>
              </Row>
            </Card>
          </ContainerCol>
          <ContainerCol xs={24} md={12} lg={12} xl={8} xxl={6}>
            <Card title={"文章"}>
              <Row>
                <Col span={12}>
                  <Statistic title={"数量"} value={articles.length} />
                </Col>
                <Col span={12}>
                  <Statistic title={"总字数"} value={articleWordCounts} />
                </Col>
              </Row>
            </Card>
          </ContainerCol>
          <ContainerCol xs={24} md={12} lg={12} xl={8} xxl={6}>
            <Card title={"项目"}>
              <Row>
                <Col span={12}>
                  <Statistic title={"数量"} value={projectItems.length} />
                </Col>
                <Col span={12}>
                  <Statistic title={"总字数"} value={projectItemWordCounts} />
                </Col>
              </Row>
            </Card>
          </ContainerCol>
          <ContainerCol xs={24} md={12} lg={12} xl={8} xxl={6}>
            <Card title={"知识库"}>
              <Row>
                <Col span={12}>
                  <Statistic title={"数量"} value={documentItems.length} />
                </Col>
                <Col span={12}>
                  <Statistic title={"总字数"} value={documentItemWordCounts} />
                </Col>
              </Row>
            </Card>
          </ContainerCol>
        </Row>
        {notesLineData.length > 4 && (
          <>
            <h2>数据趋势</h2>
            <Row gutter={[16, 16]}>
              <ContainerCol forceRefresh md={24} lg={12} xl={12} xxl={12}>
                <Card title={"笔记数量"}>
                  <Line
                    xField={"date"}
                    yField={"count"}
                    data={notesLineData}
                    colorField={"type"}
                    shapeField={"smooth"}
                    seriesField={"type"}
                    axis={{
                      x: {
                        title: "日期",
                      },
                      y: {
                        title: "数量",
                      },
                    }}
                    theme={isDark ? "classicDark" : "classic"}
                  />
                </Card>
              </ContainerCol>
              <ContainerCol forceRefresh md={24} lg={12} xl={12} xxl={12}>
                <Card title={"字数统计"}>
                  <Line
                    xField={"date"}
                    yField={"wordsCount"}
                    data={notesLineData}
                    colorField={"type"}
                    shapeField={"smooth"}
                    seriesField={"type"}
                    axis={{
                      x: {
                        title: "日期",
                      },
                      y: {
                        title: "字数",
                      },
                    }}
                    theme={isDark ? "classicDark" : "classic"}
                  />
                </Card>
              </ContainerCol>
            </Row>
          </>
        )}
        <h2>最近编辑</h2>
        <Row gutter={[16, 16]} align={"stretch"}>
          <ContainerCol xs={24} md={12} lg={12} xl={8} xxl={6}>
            <Card title={"卡片"} style={{ height: "100%" }}>
              <div className={styles.list}>
                <For
                  data={latestOperations.cards}
                  renderItem={(card) => (
                    <Popover
                      key={card.id}
                      trigger={"hover"}
                      content={
                        <Editor
                          readonly
                          initValue={card.content}
                          extensions={customExtensions}
                          style={{
                            maxWidth: 300,
                            maxHeight: 200,
                            overflow: "auto",
                            padding: 12,
                          }}
                        />
                      }
                    >
                      <div
                        className={styles.item}
                        key={card.id}
                        onClick={() => {
                          navigate(`/cards/detail/${card.id}`);
                        }}
                      >
                        {getEditorText(card.content, 20)}
                      </div>
                    </Popover>
                  )}
                />
              </div>
            </Card>
          </ContainerCol>
          <ContainerCol xs={24} md={12} lg={12} xl={8} xxl={6}>
            <Card title={"文章"} style={{ height: "100%" }}>
              <div className={styles.list}>
                <For
                  data={latestOperations.articles}
                  renderItem={(article) => (
                    <Popover
                      key={article.id}
                      trigger={"hover"}
                      content={
                        <Editor
                          readonly
                          initValue={article.content}
                          extensions={customExtensions}
                          style={{
                            maxWidth: 300,
                            maxHeight: 200,
                            overflow: "auto",
                            padding: 12,
                          }}
                        />
                      }
                    >
                      <div
                        className={styles.item}
                        key={article.id}
                        onClick={() => {
                          navigate("/articles/detail/" + article.id);
                        }}
                      >
                        {article.title}
                      </div>
                    </Popover>
                  )}
                />
              </div>
            </Card>
          </ContainerCol>
          <ContainerCol xs={24} md={12} lg={12} xl={8} xxl={6}>
            <Card title={"项目"} style={{ height: "100%" }}>
              <div className={styles.list}>
                <For
                  data={latestOperations.projectItems}
                  renderItem={(projectItem) => (
                    <Popover
                      key={projectItem.id}
                      trigger={"hover"}
                      content={
                        <Editor
                          readonly
                          extensions={customExtensions}
                          initValue={projectItem.content}
                          style={{
                            maxWidth: 300,
                            maxHeight: 200,
                            overflow: "auto",
                            padding: 12,
                          }}
                        />
                      }
                    >
                      <div
                        className={styles.item}
                        key={projectItem.id}
                        onClick={() => {
                          if (projectItem.projects.length === 0) return;
                          navigate(
                            `/projects/detail/${projectItem.projects[0]}`,
                          );
                          useProjectsStore.setState({
                            activeProjectItemId: projectItem.id,
                          });
                        }}
                      >
                        {projectItem.title}
                      </div>
                    </Popover>
                  )}
                />
              </div>
            </Card>
          </ContainerCol>
          <ContainerCol xs={24} md={12} lg={12} xl={8} xxl={6}>
            <Card title={"知识库"} style={{ height: "100%" }}>
              <div className={styles.list}>
                <For
                  data={latestOperations.documentItems}
                  renderItem={(documentItem) => (
                    <Popover
                      key={documentItem.id}
                      trigger={"hover"}
                      content={
                        <Editor
                          readonly
                          extensions={customExtensions}
                          initValue={documentItem.content}
                          style={{
                            maxWidth: 300,
                            maxHeight: 200,
                            overflow: "auto",
                            padding: 12,
                          }}
                        />
                      }
                    >
                      <div
                        className={styles.item}
                        key={documentItem.id}
                        onClick={async () => {
                          const documents =
                            await getRootDocumentsByDocumentItemId(
                              documentItem.id,
                            );
                          if (documents.length === 0) return;
                          const documentId = documents[0].id;
                          navigate(`/documents/detail/${documentId}`);
                          useDocumentsStore.setState({
                            activeDocumentItemId: documentItem.id,
                          });
                        }}
                      >
                        {documentItem.title}
                      </div>
                    </Popover>
                  )}
                />
              </div>
            </Card>
          </ContainerCol>
        </Row>
      </div>
    </div>
  );
});

export default HomeView;
