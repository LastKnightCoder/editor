import { MenuProps } from "antd";

export const ADD_MENU_ITEMS: MenuProps["items"] = [
  {
    key: "add-project-item",
    label: "添加文档",
  },
  {
    key: "add-notion-document-project-item",
    label: "添加 Notion 文档",
  },
  {
    key: "add-white-board-project-item",
    label: "添加白板",
  },
  {
    key: "add-video-note-project-item",
    label: "添加视频",
    children: [
      {
        key: "add-local-video-note-project-item",
        label: "本地视频",
      },
      {
        key: "add-remote-video-note-project-item",
        label: "远程视频",
      },
      {
        key: "add-bilibili-video-note-project-item",
        label: "Bilibili 视频",
      },
      {
        key: "add-youtube-video-note-project-item",
        label: "YouTube 视频",
      },
      {
        key: "add-notion-video-note-project-item",
        label: "Notion 视频",
      },
    ],
  },
  {
    key: "add-audio-note-project-item",
    label: "添加音频",
    children: [
      {
        key: "add-local-audio-note-project-item",
        label: "本地音频",
      },
      {
        key: "add-remote-audio-note-project-item",
        label: "远程音频",
      },
      {
        key: "add-xiaoyuzhou-audio-note-project-item",
        label: "小宇宙播客",
      },
      {
        key: "add-bilibili-audio-note-project-item",
        label: "Bilibili 音频",
      },
      {
        key: "add-youtube-audio-note-project-item",
        label: "YouTube 音频",
      },
    ],
  },
  {
    key: "add-webview-project-item",
    label: "添加网页",
  },
  {
    key: "add-table-project-item",
    label: "添加表格",
  },
  {
    key: "add-pdf-project-item",
    label: "添加 PDF",
    children: [
      { key: "add-local-pdf-project-item", label: "本地 PDF" },
      { key: "add-remote-pdf-project-item", label: "远程 PDF" },
      { key: "link-pdf-project-item", label: "关联已有 PDF" },
    ],
  },
  {
    key: "add-epub-project-item",
    label: "添加 EPUB",
    children: [
      { key: "add-local-epub-project-item", label: "本地 EPUB" },
      { key: "add-remote-epub-project-item", label: "远程 EPUB" },
      { key: "link-epub-project-item", label: "关联已有 EPUB" },
    ],
  },
  {
    key: "link-card-project-item",
    label: "关联卡片",
  },
  {
    key: "link-white-board-project-item",
    label: "关联白板",
  },
  {
    key: "import-markdown",
    label: "导入Markdown",
  },
];
