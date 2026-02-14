import RichTextSetter from "./RichTextSetter";
import GeometrySetter from "./GeometrySetter";
import ArrowSetter from "./ArrowSetter";
import ImageSetter from "./ImageSetter";
import MultiSelectSetter from "./MultiSelectSetter";
import FrameSetter from "./FrameSetter";
import MindMapSetter from "./MindMapSetter";
import HandwriteSetter from "./HandwriteSetter";

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
  "mind-node": {
    component: MindMapSetter,
  },
  multiselect: {
    component: MultiSelectSetter,
  },
};
