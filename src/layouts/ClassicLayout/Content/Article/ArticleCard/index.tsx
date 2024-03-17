import React, { useState, useRef } from 'react';
import classnames from "classnames";
import dayjs from "dayjs";
import { message, Modal, Popover, Spin, Typography } from 'antd';
import SVG from 'react-inlinesvg';
import { CalendarOutlined } from '@ant-design/icons';
import { MdMoreVert } from 'react-icons/md';

import useTheme from "@/hooks/useTheme";
import Editor from "@/components/Editor";
import Tags from "@/components/Tags";
import If from "@/components/If";
import { IArticle } from "@/types";

import star from '@/assets/article/star.svg';

import styles from './index.module.less';

const { Text } = Typography;

interface IArticleCardProps {
  article: IArticle;
  className?: string;
  style?: React.CSSProperties;
  imageRight?: boolean;
  onClick?: () => void;
  isTop?: boolean;
  updateArticleIsTop?: (articleId: number, isTop: boolean) => void;
  deleteArticle?: (articleId: number) => void;
  updateArticleBannerBg?: (articleId: number, bannerBg: string) => void;
  uploadFile?: (file: File) => Promise<string | null>;
}

const allThemes = [styles.green, styles.blue, styles.red, styles.yellow, styles.purple];

const ArticleCard = (props: IArticleCardProps) => {
  const { isDark } = useTheme();
  const [settingOpen, setSettingOpen] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const fileUploadRef = useRef<HTMLInputElement>(null);

  const {
    article,
    className,
    style,
    imageRight,
    onClick,
    isTop = false,
    deleteArticle,
    updateArticleIsTop,
    updateArticleBannerBg,
    uploadFile,
  } = props;

  const randomTheme = allThemes[article.id % allThemes.length];
  const cardClassName = classnames(
    styles.articleCard,
    randomTheme,
    {
      [styles.right]: imageRight,
      [styles.dark]: isDark,
    },
    className
  )

  const handleUploadFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setBannerUploading(true);
    const files = event.target.files;
    if (!files) {
      setBannerUploading(false);
      return;
    }
    const file = files[0];
    const url = await uploadFile?.(file);
    if (!url) {
      message.error('上传失败');
      setBannerUploading(false);
      return;
    }
    updateArticleBannerBg?.(article.id, url || '');
    setBannerUploading(false);
  }

  const handleDeleteArticle = () => {
    Modal.confirm({
      title: '确定删除该文章？',
      onOk: () => {
        deleteArticle?.(article.id);
      },
      okText: '确定',
      cancelText: '取消',
    });
    setSettingOpen(false);
  }

  return (
    <Spin spinning={bannerUploading}>
      <div className={cardClassName} style={style}>
        <div className={classnames(styles.imageContainer, { [styles.right]: imageRight })} onClick={onClick}>
          <img src={article.bannerBg || 'https://cdn.jsdelivr.net/gh/LastKnightCoder/ImgHosting2/20210402153806.png'} alt={''} />
          <If condition={isTop}>
            <SVG src={star} className={styles.topStar} />
          </If>
        </div>
        <div className={styles.content}>
          <div className={classnames(styles.operate, { [styles.left]: imageRight } )}>
            <Popover
              open={settingOpen}
              onOpenChange={setSettingOpen}
              placement={'bottomRight'}
              trigger={'click'}
              overlayInnerStyle={{
                padding: 4,
              }}
              content={(
                <div className={styles.settings}>
                  <div className={styles.settingItem} onClick={() => { updateArticleIsTop?.(article.id, !isTop); setSettingOpen(false) }}>{ isTop ? '取消置顶' : '置顶文章' }</div>
                  <div className={styles.settingItem} onClick={handleDeleteArticle}>删除文章</div>
                  <div className={styles.settingItem} onClick={() => { setSettingOpen(false); fileUploadRef.current?.click(); }}>换背景图</div>
                  <input ref={fileUploadRef} type={'file'} accept={'image/*'} style={{ display: 'none' }} onChange={handleUploadFileChange} />
                </div>
              )}
            >
              <MdMoreVert />
            </Popover>
          </div>
          <div onClick={onClick}>
            <Text className={styles.title} ellipsis={{ tooltip: article.title }}>
              {article.title}
            </Text>
          </div>
          <div className={styles.timeAndTags}>
            <div className={styles.time}>
              <CalendarOutlined />
              <span className={styles.date}>
              发表于{dayjs(article.update_time).format('YYYY-MM-DD HH:mm:ss')}
            </span>
            </div>
          </div>
          <div>
            <Tags tags={article.tags} showIcon />
          </div>
          <Editor
            initValue={article.content.slice(0, 1)}
            readonly
          />
        </div>
      </div>
    </Spin>
  )
}

export default ArticleCard;