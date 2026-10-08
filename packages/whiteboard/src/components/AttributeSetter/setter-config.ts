import RichTextSetter from "./RichTextSetter";
import GeometrySetter from "./GeometrySetter";
import ArrowSetter from "./ArrowSetter";
import ImageSetter from "./ImageSetter";
import MultiSelectSetter from "./MultiSelectSetter";
import FrameSetter from "./FrameSetter";
import MindMapSetter from "./MindMapSetter";
import HandwriteSetter from "./HandwriteSetter";
import ColumnSetter from "./ColumnSetter";
import MediaSetter from "./MediaSetter";

export default {
  richtext: {
    component: RichTextSetter,
  },
  card: {
    component: RichTextSetter,
  },
  geometry: {
    component: GeometrySetter,
  },
  handwrite: {
    component: HandwriteSetter,
  },
  arrow: {
    component: ArrowSetter,
  },
  image: {
    component: ImageSetter,
  },
  frame: {
    component: FrameSetter,
  },
  column: {
    component: ColumnSetter,
  },
  "mind-node": {
    component: MindMapSetter,
  },
  video: {
    component: MediaSetter,
  },
  webview: {
    component: MediaSetter,
  },
  audio: {
    component: MediaSetter,
  },
  whiteboard: {
    component: MediaSetter,
  },
  multiselect: {
    component: MultiSelectSetter,
  },
};
