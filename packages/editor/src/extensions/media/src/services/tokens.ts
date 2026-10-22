import { createServiceId } from "@tau/shared/service-contract";
import type { MediaAction, MediaInsertSourceList, VideoContentProvider } from "./mediaProviders";
import type { EditorSlots } from "./slots";
import type { ImageAppearanceOption } from "../extensions/image/appearanceOption";

export const IMediaInsertSources = createServiceId<MediaInsertSourceList>("mediaInsertSources");
export const IVideoContentProviders =
  createServiceId<VideoContentProvider[]>("videoContentProviders");
export const IMediaActions = createServiceId<MediaAction[]>("mediaActions");
export const IEditorSlots = createServiceId<EditorSlots>("editorSlots");
/** 媒体默认外观（圆角 / 阴影）：宿主用传给 createImageExtensions 的同一份来源注册，供插件块读取 */
export const IMediaAppearance = createServiceId<ImageAppearanceOption>("mediaAppearance");
