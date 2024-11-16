export interface VecDocument {
  id: number;
  createTime: number;
  updateTime: number;
  refId: number;
  refType: string;
  refUpdateTime: number;
  contents: string;
  contentsEmbedding: number[];
}
