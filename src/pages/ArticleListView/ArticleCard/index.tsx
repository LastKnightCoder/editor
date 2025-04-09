import React, { useState, useRef, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import classnames from "classnames";
import { Dropdown, message, Modal, Spin, Typography } from "antd";
import SVG from "react-inlinesvg";
import { CalendarOutlined } from "@ant-design/icons";
import star from "@/assets/article/star.svg";
import { MdMoreVert } from "react-icons/md";

import LocalImage from "@/components/LocalImage";
import Editor, { EditorRef } from "@editor/index.tsx";
import Tags from "@/components/Tags";
import If from "@/components/If";

import { useCreation, useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme.ts";
import useUploadResource from "@/hooks/useUploadResource.ts";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";

import { IArticle } from "@/types";

import { formatDate, getMarkdown, downloadMarkdown } from "@/utils";
import { useNavigate } from "react-router-dom";
import styles from "./index.module.less";
import {
  getFileBaseName,
  readBinaryFile,
  selectFile,
  openArticleInNewWindow,
} from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
import useRightSidebarStore from "@/stores/useRightSidebarStore";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";

const { Text } = Typography;

interface IArticleCardProps {
  article: IArticle;
  className?: string;
  style?: React.CSSProperties;
  imageRight?: boolean;
  disableOperation?: boolean;
  updateArticleBannerBg?: (id: number, bannerBg: string) => Promise<void>;
  updateArticleIsTop?: (id: number, isTop: boolean) => Promise<void>;
  deleteArticle?: (id: number) => Promise<void>;
}

const allThemes = [
  styles.green,
  styles.blue,
  styles.red,
  styles.yellow,
  styles.purple,
];

const ArticleCard = (props: IArticleCardProps) => {
  const {
    article,
    className,
    style,
    imageRight,
    disableOperation,
    updateArticleBannerBg,
    updateArticleIsTop,
    deleteArticle,
  } = props;

  const articleEventBus = useCreation(
    () => defaultArticleEventBus.createEditor(),
    [],
  );

  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [settingOpen, setSettingOpen] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const editorRef = useRef<EditorRef>(null);

  const uploadResource = useUploadResource();

  const randomTheme = allThemes[article.id % allThemes.length];
  const cardClassName = classnames(styles.articleCard, randomTheme, {
    [styles.right]: imageRight,
    [styles.dark]: isDark,
  });

  const { startPresentation } = useArticleManagementStore(
    useShallow((state) => ({
      startPresentation: state.startArticlePresentation,
    })),
  );

  useEffect(() => {
    const unsubscribe = articleEventBus.subscribeToArticleWithId(
      "article:updated",
      article.id,
      (data) => {
        editorRef.current?.setEditorValue(data.article.content.slice(0, 1));
      },
    );
    return () => {
      unsubscribe();
    };
  }, [articleEventBus, article.id]);

  const currentDatabaseName = useSettingStore(
    useShallow((state) => state.setting.database.active),
  );

  const handleUploadFileChange = useMemoizedFn(async () => {
    const filePath = await selectFile({
      properties: ["openFile"],
      filters: [
        {
          name: "Image",
          extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp"],
        },
      ],
    });
    if (!filePath || (Array.isArray(filePath) && filePath.length !== 1)) {
      setBannerUploading(false);
      return;
    }
    const fileData = await readBinaryFile(filePath[0]);
    const file = new File([fileData], await getFileBaseName(filePath[0]));
    if (file.size > 1024 * 1024 * 5) {
      message.error("文件大小超过5M");
      setBannerUploading(false);
      return;
    }
    const url = await uploadResource(file);
    if (!url) {
      message.error("上传失败");
      setBannerUploading(false);
      return;
    }
    updateArticleBannerBg?.(article.id, url || "");
    setBannerUploading(false);
    articleEventBus.publishArticleEvent("article:updated", {
      ...article,
      bannerBg: url || "",
    });
  });

  const handleDeleteArticle = useMemoizedFn(() => {
    Modal.confirm({
      title: "确定删除该文章？",
      onOk: async () => {
        if (deleteArticle) {
          await deleteArticle(article.id);
          message.success("删除成功");
        }
      },
      okText: "确定",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
    });
    setSettingOpen(false);
    articleEventBus.publishArticleEvent("article:deleted", article);
  });

  const handleClickArticle = useMemoizedFn(() => {
    navigate(`/articles/detail/${article.id}`);
  });

  const handleEdit = () => {
    setSettingOpen(false);
    handleUploadFileChange();
  };

  const handleView = () => {
    const { addTab } = useRightSidebarStore.getState();
    addTab({
      id: String(article.id),
      title: article.title || "文章",
      type: "article",
    });
    setSettingOpen(false);
  };

  return (
    <div className={classnames(styles.cardContainer, className)}>
      <Spin spinning={bannerUploading}>
        <div className={cardClassName} style={style}>
          <div
            className={classnames(styles.imageContainer, {
              [styles.right]: imageRight,
            })}
            onClick={handleClickArticle}
          >
            <LocalImage
              url={
                article.bannerBg ||
                "https://cdn.jsdelivr.net/gh/LastKnightCoder/ImgHosting2/20210402153806.png"
              }
            />
            <If condition={article.isTop}>
              <SVG src={star} className={styles.topStar} />
            </If>
          </div>
          <div className={styles.content}>
            {!disableOperation && (
              <div
                className={classnames(styles.operate, {
                  [styles.left]: imageRight,
                })}
              >
                <Dropdown
                  open={settingOpen}
                  onOpenChange={setSettingOpen}
                  placement={"bottomRight"}
                  trigger={["click"]}
                  menu={{
                    items: [
                      {
                        key: "presentation-mode",
                        label: "演示模式",
                        onClick: () => {
                          startPresentation(article);
                          setSettingOpen(false);
                        },
                      },
                      {
                        key: "export",
                        label: "导出文章",
                        onClick: () => {
                          const markdown = getMarkdown(article.content);
                          downloadMarkdown(markdown, article.title);
                        },
                      },
                      {
                        key: "delete-article",
                        label: "删除文章",
                        onClick: handleDeleteArticle,
                      },
                      {
                        key: "change-banner-bg",
                        label: "换背景图",
                        onClick: handleEdit,
                      },
                      {
                        key: "set-top",
                        label: article.isTop ? "取消置顶" : "设置置顶",
                        onClick: () => {
                          updateArticleIsTop?.(article.id, !article.isTop);
                          setSettingOpen(false);
                        },
                      },
                      {
                        key: "open-in-new-window",
                        label: "窗口打开",
                        onClick: () => {
                          openArticleInNewWindow(
                            currentDatabaseName,
                            article.id,
                          );
                        },
                      },
                      {
                        key: "open-in-right-sidebar",
                        label: "右侧打开",
                        onClick: handleView,
                      },
                    ],
                  }}
                >
                  <MdMoreVert />
                </Dropdown>
              </div>
            )}
            <div onClick={handleClickArticle}>
              <Text
                className={styles.title}
                ellipsis={{ tooltip: article.title }}
              >
                {article.title}
              </Text>
            </div>
            <div className={styles.timeAndTags}>
              <div className={styles.time}>
                <CalendarOutlined />
                <span className={styles.date}>
                  发表于：{formatDate(article.create_time, true)}
                </span>
              </div>
            </div>
            <div>
              <Tags tags={article.tags} showIcon />
            </div>
            <Editor
              className={styles.editor}
              ref={editorRef}
              initValue={article.content.slice(0, 1)}
              readonly
            />
          </div>
        </div>
      </Spin>
    </div>
  );
};

export default ArticleCard;
