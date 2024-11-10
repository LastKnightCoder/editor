import { Descendant } from "slate";

export interface AudioElement {
  type: 'audio';
  src: string;
  uploading?: boolean;
  isFromGenerate?: boolean;
  audioText?: string;
  children: Descendant[];
}
