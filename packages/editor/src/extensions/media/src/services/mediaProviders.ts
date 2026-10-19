import type { ComponentType, ReactNode } from "react";

import { type CustomElement } from "@tau/editor/api";
import type { VideoElement } from "../types/element/video";

/**
 * 媒体 Provider 协议：业务侧向编辑器注入媒体能力的三个正交扩展点。
 * 媒体扩展只理解"媒体元素 + 不透明业务数据"，所有内容源/生成/编辑类
 * 业务知识（如视频平台解析、AI 生图、语音合成）均经由此协议注入。
 */

export type MediaType = "video" | "audio" | "image";

/** 业务插入内容的负载：src 必填，其余为不透明透传字段 */
export interface MediaInsertPayload {
  src: string;
  title?: string;
  metaInfo?: VideoElement["metaInfo"];
  /** 元素属性补丁（如音频的生成溯源字段），由媒体扩展合并写入文档 */
  attributes?: Record<string, unknown>;
}

/**
 * 插入来源：宿主向编辑器注册的"媒体插入方式"。
 * 媒体扩展固定提供"本地上传 / 网络地址"两个通用入口，其余入口（内容源选择器、
 * 生成类面板等）全部来自宿主注册——媒体扩展只在菜单中列出
 * 注册项并在点击时调用 open，打开什么、如何选择由宿主完全决定。
 */
export interface MediaInsertSource {
  id: string;
  label: string;
  /** 菜单图标（slash 菜单二级项） */
  icon?: ComponentType<{ className?: string }>;
  mediaTypes: MediaType[];
  /** 可用性检查（如依赖宿主配置），不可用时媒体扩展隐藏对应入口 */
  isAvailable?: () => boolean;
  /** 打开宿主的选择/生成 UI；完成后回调 onInsert，由媒体扩展写入文档 */
  open: (options: {
    mediaType: MediaType;
    /** 单条插入一个媒体元素；传数组时依次插入多个同级元素 */
    onInsert: (payload: MediaInsertPayload | MediaInsertPayload[]) => void;
  }) => void;
}

/**
 * 插入来源列表：静态数组，或每次组装菜单时调用的函数（来源随宿主状态增减时使用，
 * 如每个启用的视频插件各一个入口）。
 */
export type MediaInsertSourceList =
  readonly MediaInsertSource[] | (() => readonly MediaInsertSource[]);

/**
 * 媒体选择器：已有媒体内容的编辑 UI 需要补充素材时（如画廊添加图片），
 * 由宿主注册的选择入口。媒体扩展只渲染入口并调用 select，选择过程
 * （弹什么窗、从哪选）完全由宿主决定，取消时不回调。
 */
export interface MediaSelector {
  id: string;
  /** 入口文案（按钮 / 菜单项） */
  label: string;
  mediaTypes: MediaType[];
  isAvailable?: () => boolean;
  select: (options: {
    mediaType: MediaType;
    multiple: boolean;
    onSelected: (items: SelectedMedia[]) => void;
  }) => void;
}

/** 选择器选中的媒体（宿主已解析为可写入文档的地址） */
export interface SelectedMedia {
  url: string;
  name?: string;
}

/**
 * 内容渲染 Provider：已有媒体元素需要平台解析后才能播放时（如视频站链接），
 * 由匹配的 Provider 接管内容渲染；无匹配时媒体扩展走默认渲染路径。
 */
export interface VideoContentProvider {
  id: string;
  /** 来源名（如「Bilibili」），与节点标题一起显示在播放器底栏信息位；可按元素给出 */
  label?: string | ((element: Pick<VideoElement, "src" | "metaInfo">) => string | undefined);
  /** 判定元素是否属于本 Provider（通常依据 metaInfo.type 与 src 形态） */
  match: (element: Pick<VideoElement, "src" | "metaInfo">) => boolean;
  /**
   * 判定裸 URL 是否为本 Provider 的内容源地址（如视频站页面链接），
   * 仅用于"网络地址"插入时的拦截提示，与 match（渲染接管）语义不同：
   * 普通直链类 Provider（如远程流式播放）不应实现此方法。
   */
  isSourceUrl?: (src: string) => boolean;
  /**
   * 内容渲染：内部自行解析（可消费宿主注入的解析依赖），
   * 解析出可播放地址后调用 renderPlayback 复用媒体扩展通用播放器。
   * useLocalVideo 为 false 时使用流式播放器（MSE）而非本地播放器插槽。
   */
  Content: ComponentType<{
    element: VideoElement;
    readOnly: boolean;
    renderPlayback: (url: string, useLocalVideo?: boolean) => ReactNode;
  }>;
}

/**
 * 对已有媒体内容的业务操作（如 AI 修图）：
 * 媒体扩展按注册组装有图工具条按钮与右键菜单项，Modal 由媒体扩展统一挂载。
 */
export interface MediaAction {
  id: string;
  label: string;
  mediaTypes: MediaType[];
  icon?: ReactNode;
  isAvailable?: () => boolean;
  Modal: ComponentType<{
    element: CustomElement;
    open: boolean;
    onCancel: () => void;
    /** 业务完成后的元素属性补丁（如图片 url 替换），由媒体扩展写入文档 */
    onApply: (patch: Record<string, unknown>) => void;
  }>;
}
