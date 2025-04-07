import RichTextSetter from "./RichTextSetter";
import GeometrySetter from "./GeometrySetter";
import ArrowSetter from "./ArrowSetter";
import ImageSetter from "./ImageSetter";
import MultiSelectSetter from "./MultiSelectSetter";

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
  multiselect: {
    component: MultiSelectSetter,
  },
};
