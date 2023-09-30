import ParagraphExtension from "./paragraph";
import HeaderExtension from "./header";
import ImageExtension from "./image";
import BulletedListExtension from "./bulleted-list";
import ListItemExtension from "./list-item";

export const paragraph = new ParagraphExtension();
export const header = new HeaderExtension();
export const image = new ImageExtension();
export const bulletedList = new BulletedListExtension();
export const listItem = new ListItemExtension();

export const startExtensions = [
  paragraph,
  header,
  image,
  bulletedList,
  listItem,
];
