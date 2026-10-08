import { createContext, useContext, type ComponentType, type Ref } from "react";
import type { ColumnDef, RowData } from "./types";

export interface DatabaseImage {
  id: string;
  url: string;
  alt?: string;
}

export interface RowDetailBodyHandle {
  flush(): Promise<void>;
}

export interface RowDetailBodyProps {
  row: RowData;
  readonly: boolean;
  onRowChange(patch: Partial<RowData>): void | Promise<void>;
  isRowPresent(): boolean;
  ref?: Ref<RowDetailBodyHandle>;
}

export interface GalleryCoverProps {
  row: RowData;
  columns: ColumnDef[];
  coverType: "detail" | "image";
  coverImageColumnId?: string;
}

export interface DatabaseImageProps {
  src: string;
  alt: string;
  className?: string;
  onLoadError?: () => void;
}

export interface DatabaseSlots {
  RowDetailBody?: ComponentType<RowDetailBodyProps>;
  GalleryCover?: ComponentType<GalleryCoverProps>;
  Image?: ComponentType<DatabaseImageProps>;
  coverGradient?: (rowId: string) => string;
}

export const DatabaseHostContext = createContext<DatabaseSlots>({});
export const useDatabaseSlots = () => useContext(DatabaseHostContext);

export function BrowserImage({ src, alt, className, onLoadError }: DatabaseImageProps) {
  return <img src={src} alt={alt} className={className} onError={onLoadError} />;
}
