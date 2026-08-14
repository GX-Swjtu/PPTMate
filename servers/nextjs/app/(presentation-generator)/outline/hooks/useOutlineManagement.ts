import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { arrayMove } from "@dnd-kit/sortable";
import { setOutlines } from "@/store/slices/presentationGeneration";
import { notify } from "@/components/ui/sonner";
import { MAX_NUMBER_OF_SLIDES } from "@/utils/presentationLimits";

export const useOutlineManagement = (outlines: { content: string }[] | null) => {
  const dispatch = useDispatch();

  const handleDragEnd = useCallback(
    (oldIndex: number, newIndex: number) => {
      if (!outlines) return;
      if (
        oldIndex === newIndex ||
        oldIndex < 0 ||
        newIndex < 0 ||
        oldIndex >= outlines.length ||
        newIndex >= outlines.length
      ) {
        return;
      }

      const reorderedArray = arrayMove(outlines, oldIndex, newIndex);
      dispatch(setOutlines(reorderedArray));
    },
    [outlines, dispatch]
  );

  const handleAddSlide = useCallback(() => {
    if (!outlines) return;
    if (outlines.length >= MAX_NUMBER_OF_SLIDES) {
      notify.warning(
        "已达到幻灯片数量上限",
        `大纲最多可包含 ${MAX_NUMBER_OF_SLIDES} 张幻灯片。`
      );
      return;
    }

    const updatedOutlines = [...outlines, { content: "幻灯片标题" }];
    dispatch(setOutlines(updatedOutlines));
  }, [outlines, dispatch]);

  return { handleDragEnd, handleAddSlide };
};
