import RichTextSetter from "./RichTextSetter";
import GeometrySetter from "./GeometrySetter";
import ArrowSetter from "./ArrowSetter";
import ImageSetter from "./ImageSetter";
import MultiSelectSetter from "./MultiSelectSetter";
import FrameSetter from "./FrameSetter";

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
  arrow: {
    component: ArrowSetter,
  },
  image: {
    component: ImageSetter,
  },
  frame: {
    component: FrameSetter,
  },
  multiselect: {
    component: MultiSelectSetter,
  },
};
