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

import { useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme.ts";
import useUploadResource from "@/hooks/useUploadResource.ts";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";

import { IArticle } from "@/types";

import { formatDate } from "@/utils";
import { useLocation, useNavigate } from "react-router-dom";
import styles from "./index.module.less";
import { openArticleInNewWindow } from "@/commands/article";
import {
  findOneArticle,
  getFileBaseName,
  readBinaryFile,
  selectFile,
} from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
import { on, off } from "@/electron";
const { Text } = Typography;

interface IArticleCardProps {
  article: IArticle;
  className?: string;
  style?: React.CSSProperties;
  imageRight?: boolean;
  disableOperation?: boolean;
}

const allThemes = [
  styles.green,
  styles.blue,
  styles.red,
  styles.yellow,
  styles.purple,
];

const ArticleCard = (props: IArticleCardProps) => {
  const { article, className, style, imageRight, disableOperation } = props;

  const { isDark } = useTheme();
  const location = useLocation();
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

  const {
    updateArticleIsTop,
    deleteArticle,
    updateArticleBannerBg,
    activeArticleId,
    updateArticle,
    startPresentation,
  } = useArticleManagementStore(
    useShallow((state) => ({
      updateArticleIsTop: state.updateArticleIsTop,
      deleteArticle: state.deleteArticle,
      updateArticleBannerBg: state.updateArticleBannerBg,
      activeArticleId: state.activeArticleId,
      updateArticle: state.updateArticle,
      startPresentation: state.startArticlePresentation,
    })),
  );

  const { currentDatabaseName } = useSettingStore(
    useShallow((state) => ({
      currentDatabaseName: state.setting.database.active,
    })),
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
  });

  const handleDeleteArticle = useMemoizedFn(() => {
    Modal.confirm({
      title: "确定删除该文章？",
      onOk: async () => {
        await deleteArticle(article.id);
        message.success("删除成功");
      },
      okText: "确定",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
    });
    setSettingOpen(false);
  });

  const handleClickArticle = useMemoizedFn(() => {
    if (location.pathname !== "/articles") {
      navigate("/articles");
      useArticleManagementStore.setState({
        activeArticleId: article.id,
      });
      return;
    }

    if (article.id === activeArticleId) {
      useArticleManagementStore.setState({
        activeArticleId: undefined,
      });
      return;
    }
    useArticleManagementStore.setState({
      activeArticleId: article.id,
    });
  });

  useEffect(() => {
    const handleArticleWindowClosed = async (
      _e: any,
      data: { articleId: number; databaseName: string },
    ) => {
      if (
        data.articleId === article.id &&
        data.databaseName === currentDatabaseName
      ) {
        const article = await findOneArticle(data.articleId);
        editorRef.current?.setEditorValue(article.content.slice(0, 1));
        await updateArticle(article);
      }
    };

    on("article-window-closed", handleArticleWindowClosed);

    return () => {
      off("article-window-closed", handleArticleWindowClosed);
    };
  }, []);

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
                          startPresentation(article.id);
                          setSettingOpen(false);
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
                        onClick: () => {
                          setSettingOpen(false);
                          handleUploadFileChange();
                        },
                      },
                      {
                        key: "set-top",
                        label: article.isTop ? "取消置顶" : "设置置顶",
                        onClick: () => {
                          updateArticleIsTop(article.id, !article.isTop);
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
