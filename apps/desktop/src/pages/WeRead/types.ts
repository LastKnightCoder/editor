export type NotebookSnapshot = {
  noteCount: number;
  reviewCount: number;
  lastReadDate: string;
  synckeys: {
    highlights?: number;
    reviews?: number;
    progress?: number;
  };
};
