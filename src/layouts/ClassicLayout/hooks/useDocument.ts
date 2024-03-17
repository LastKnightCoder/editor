import useDocumentsStore from "@/stores/useDocumentsStore";

const useDocument = () => {
  const {
    documents,
  } = useDocumentsStore((state) => ({
    documents: state.documents,
  }));

  return {
    documents
  }
}

export default useDocument;
