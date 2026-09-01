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
import TemplateService from "../../services/api/template";
import {
  DEFAULT_TEMPLATE_THEME,
  normalizeTemplateTheme,
  resolveTemplateIdFromPresentation,
} from "@/lib/template-theme";


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
        const templateId = resolveTemplateIdFromPresentation(normalizedData);
        const responseTheme = normalizeTemplateTheme(normalizedData.theme);
        const fetchedTheme = templateId
          ? await TemplateService.getTemplateTheme(templateId)
          : null;
        const theme = fetchedTheme ?? responseTheme ?? DEFAULT_TEMPLATE_THEME;
        const themedData = {
          ...normalizedData,
          ...(templateId && !normalizedData.template_id
            ? { template_id: templateId }
            : {}),
          theme,
        };

        dispatch(setPresentationData(themedData));
        if (options?.clearHistory ?? true) {
          dispatch(clearHistory());
        }
        setLoading(false);
        if (normalizedData.fonts) {
          useFontLoader(normalizedData.fonts);
        }
        const textFont = theme.fonts?.textFont;
        if (textFont) {
          useFontLoader({ [textFont.name]: textFont.url });
        }
        const el = document.getElementById("presentation-slides-wrapper");
        applyPresentationThemeToElement(el, theme);
        return themedData;
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
