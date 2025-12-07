import {
  selectFile,
  getFileBaseName,
  readBinaryFile,
  getEditorDir,
  getSep,
  createDir,
  pathExists,
  writeBinaryFile,
} from "@/commands";
import { v4 as uuid } from "uuid";

export type BookType = "pdf" | "epub";

const BOOK_CONFIG: Record<
  BookType,
  { extensions: string[]; typeName: string; mimeType: string }
> = {
  pdf: {
    extensions: ["pdf"],
    typeName: "PDF",
    mimeType: "application/pdf",
  },
  epub: {
    extensions: ["epub"],
    typeName: "EPUB",
    mimeType: "application/epub+zip",
  },
};

const copyFileToResources = async (file: File, fileName = file.name) => {
  const editorPath = await getEditorDir();
  const sep = await getSep();
  const resourceDirPath = editorPath + sep + "resources";
  if (!(await pathExists(resourceDirPath))) {
    await createDir(resourceDirPath);
  }

  const all = fileName.split(".");
  const other = all.slice(0, all.length - 1);
  const extension = all[all.length - 1];
  const objectName = other.join(".") + "_" + uuid() + "." + extension;

  const resourcePath = resourceDirPath + sep + objectName;
  await writeBinaryFile(resourcePath, new Uint8Array(await file.arrayBuffer()));
  return resourcePath;
};

export interface ImportLocalBookResult {
  fileName: string;
  filePath: string;
}

export const importLocalBook = async (
  type: BookType,
): Promise<ImportLocalBookResult | null> => {
  const config = BOOK_CONFIG[type];
  const filePath = await selectFile({
    properties: ["openFile"],
    filters: [{ name: config.typeName, extensions: config.extensions }],
  });

  if (!filePath || filePath.length === 0) {
    return null;
  }

  const fileName = await getFileBaseName(filePath[0]);
  const fileContent = (await readBinaryFile(
    filePath[0],
  )) as Uint8Array<ArrayBuffer>;
  const file = new File([fileContent], fileName, {
    type: config.mimeType,
  });

  const storedPath = await copyFileToResources(file, fileName);

  return {
    fileName,
    filePath: storedPath,
  };
};
