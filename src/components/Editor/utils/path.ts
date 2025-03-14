import { Path } from "slate";

export const getPrevPath = (path: Path) => {
  const isFirst = path[path.length - 1] === 0;
  if (isFirst) {
    return undefined;
  }
  return Path.previous(path);
};

export const getNextPath = (path: Path) => {
  return Path.next(path);
};

export const getParentPath = (path: Path) => {
  return path.slice(0, path.length - 1);
};
