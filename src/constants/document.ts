import {ICreateDocument, ICreateDocumentItem} from "@/types";

export const DEFAULT_CREATE_DOCUMENT: ICreateDocument = {
  title: '',
  desc: '',
  authors: [],
  children: [],
  tags: [],
  links: [],
  content: [],
  bannerBg: '',
  icon: '',
  isTop: false,
}

export const DEFAULT_CREATE_DOCUMENT_ITEM: ICreateDocumentItem = {
  title: '无标题文档',
  authors: [],
  tags: [],
  isDirectory: false,
  children: [],
  isArticle: false,
  articleId: 0,
  isCard: false,
  cardId: 0,
  content: [{
    type: 'paragraph',
    children: [{ type: 'formatted', text: '' }],
  }],
  bannerBg: '',
  icon: '',
}