import { create } from "zustand";
import { ImageElement } from "../custom-types";
import {Descendant, Editor} from "slate";

interface IState {
  images: string[];
  imageElements: ImageElement[];
  isShowImagesOverview: boolean;
  currentImageIndex: number;
  hasNextImage: boolean;
  hasPrevImage: boolean;
}

interface IActions {
  showImageOverview: (element: ImageElement, editor: Editor) => void;
  switchImage: (next: boolean) => void;
  closeImagesOverview: () => void;
}

const initialState: IState = {
  images: [],
  imageElements: [],
  isShowImagesOverview: false,
  hasNextImage: false,
  hasPrevImage: false,
  currentImageIndex: -1,
}

const getAllImageElements = (children: Descendant[]) => {
  const imagesElement: ImageElement[] = [];
  for (const node of children) {
    if (node.type === 'image') {
      imagesElement.push(node);
      continue;
    }
    if ((node as any).children && Array.isArray((node as any).children)) {
      imagesElement.push(...getAllImageElements((node as any).children))
    }
  }

  return imagesElement;
}

export const useImagesOverviewStore = create<IState & IActions>((set, get) => ({
  ...initialState,
  showImageOverview: (element: ImageElement, editor: Editor) => {
    const children = editor.children;
    // 找到所有的 image element
    const imageElements: ImageElement[] = getAllImageElements(children);
    const images: string[] = imageElements.map(image => image.url);
    const index = imageElements.findIndex(imageElement => imageElement === element);
    set({
      images,
      imageElements,
      currentImageIndex: index,
      isShowImagesOverview: true,
      hasNextImage: index !== images.length - 1,
      hasPrevImage: index !== 0
    });
    document.body.style.overflow = 'hidden';
  },
  closeImagesOverview: () => {
    set({ ...initialState });
    document.body.style.overflow = 'auto';
  },
  switchImage: (next) => {
    const { hasPrevImage, hasNextImage, currentImageIndex, images } = get();
    if (next) {
      if (hasNextImage) {
        set({
          currentImageIndex: currentImageIndex + 1,
          hasNextImage: (currentImageIndex + 1) !== images.length - 1,
          hasPrevImage: true
        })
      }
    } else {
      if (hasPrevImage) {
        set({
          currentImageIndex: currentImageIndex - 1,
          hasPrevImage: (currentImageIndex - 1) !== 0,
          hasNextImage: true
        })
      }
    }
  }
}));