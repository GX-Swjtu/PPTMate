import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { notify } from "@/components/ui/sonner";
import { setPresentationData } from "@/store/slices/presentationGeneration";
import { clearHistory } from "@/store/slices/undoRedoSlice";
import { applyPresentationThemeToElement } from "../utils/applyPresentationThemeDom";
import { normalizeBackendAssetUrls } from "@/utils/api";
import { useFontLoader } from "../../hooks/useFontLoad";
import { DashboardApi } from "../../services/api/dashboard";


export const usePresentationData = (
  presentationId: string,
  setLoading: (loading: boolean) => void,
  setError: (error: boolean) => void
) => {
  const dispatch = useDispatch();
  const router = useRouter();

  const fetchUserSlides = useCallback(async (options?: { clearHistory?: boolean }) => {
    try {
      const data = await DashboardApi.getPresentation(presentationId, {
        cache: "no-store",
      });

      if (data?.version === "v1-standard") {
        notify.warning(
          "不支持此演示文稿",
          "此演示文稿由较旧版本的 PPTMate 创建，请使用兼容版本打开。"
        );
        setLoading(false);
        router.replace("/dashboard");
        return undefined;
      }

      const normalizedData = normalizeBackendAssetUrls(data);


      if (normalizedData) {
        dispatch(setPresentationData(normalizedData));
        if (options?.clearHistory ?? true) {
          dispatch(clearHistory());
        }
        setLoading(false);
      }
      if (normalizedData.fonts) {
        useFontLoader(normalizedData.fonts);
      }
      if (normalizedData?.theme) {
        const el = document.getElementById("presentation-slides-wrapper");
        applyPresentationThemeToElement(el, normalizedData.theme);
      }
      return normalizedData;
    } catch (error) {
      setError(true);
      notify.error("演示文稿加载失败", "无法加载演示文稿，请重试。");
      console.error("Error fetching user slides:", error);
      setLoading(false);
      return undefined;
    }
  }, [presentationId, dispatch, router, setLoading, setError]);

  return {
    fetchUserSlides,
  };
};
