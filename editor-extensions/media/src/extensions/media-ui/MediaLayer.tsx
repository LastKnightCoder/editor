import { type ExtensionLayerProps } from "@tau/editor/api";
import ImagesOverview from "../../components/ImagesOverview/index";
import MediaUrlInputModal from "../../components/MediaUrlInputModal/index";

export default function MediaLayer({ readOnly }: ExtensionLayerProps) {
  return (
    <>
      <ImagesOverview />
      {!readOnly && <MediaUrlInputModal />}
    </>
  );
}
