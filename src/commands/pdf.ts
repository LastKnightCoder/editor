import { invoke } from '@tauri-apps/api';

import { Pdf, PdfHighlight } from '@/types';

const transformPdfItem = (item: any): Pdf => {
  return {
    ...item,
    createTime: item.create_time,
    updateTime: item.update_time,
    isLocal: item.is_local,
    remoteUrl: item.remote_url,
    fileName: item.file_name,
    filePath: item.file_path,
  };
};

const transformPdfHighlightItem = (item: any): PdfHighlight => {
  return {
    ...item,
    createTime: item.create_time,
    updateTime: item.update_time,
    pdfId: item.pdf_id,
    highlightType: item.highlight_type,
    highlightTextStyle: item.highlight_text_style,
    pageNum: item.page_num,
    boundingClientRect: JSON.parse(item.bounding_client_rect),
    rects: JSON.parse(item.rects),
    notes: JSON.parse(item.notes)
  };
};

export const createPdf = async (pdf: Omit<Pdf, 'id' | 'createTime' | 'updateTime'>): Promise<Pdf> => {
  const res: any = await invoke('add_pdf', {
    ...pdf,
  });
  return transformPdfItem(res);
}

export const updatePdf = async (pdf: Pdf): Promise<Pdf> => {
  const res: any = await invoke('update_pdf', {
    ...pdf,
  });
  return transformPdfItem(res);
}

export const getPdfById = async (id: number): Promise<Pdf> => {
  const res: any = await invoke('get_pdf_by_id', {
    id,
  });
  return transformPdfItem(res);
}

export const getPdfList = async (): Promise<Pdf[]> => {
  const list: any[] = await invoke('get_pdf_list');
  return list.map(transformPdfItem);
}

export const removePdf = async (id: number): Promise<number> => {
  return await invoke('remove_pdf', {
    id,
  });
}

export const addPdfHighlight = async (highlight: Omit<PdfHighlight, 'id' | 'createTime' | 'updateTime'>): Promise<PdfHighlight> => {
  const res: any = await invoke('add_highlight', {
    ...highlight,
    notes: JSON.stringify(highlight.notes),
    rects: JSON.stringify(highlight.rects),
    boundingClientRect: JSON.stringify(highlight.boundingClientRect),
  });
  return transformPdfHighlightItem(res);
}

export const updatePdfHighlight = async (highlight: PdfHighlight): Promise<PdfHighlight> => {
  const res: any = await invoke('update_highlight', {
    ...highlight,
    notes: JSON.stringify(highlight.notes),
    rects: JSON.stringify(highlight.rects),
    boundingClientRect: JSON.stringify(highlight.boundingClientRect),
  });
  return transformPdfHighlightItem(res);
}

export const getPdfHighlightById = async (id: number): Promise<PdfHighlight> => {
  const res: any = await invoke('get_highlight_by_id', {
    id,
  });
  return transformPdfHighlightItem(res);
}

export const getPdfHighlights = async (pdfId: number): Promise<PdfHighlight[]> => {
  const list: any[] = await invoke('get_highlights', {
    pdfId
  });
  return list.map(transformPdfHighlightItem);
}

export const removePdfHighlight = async (id: number): Promise<number> => {
  return await invoke('remove_highlight', {
    id,
  });
}

