'use client'
import React from "react";

import { Card } from "@/components/ui/card";
import { DashboardApi } from "@/app/(presentation-generator)/services/api/dashboard";
import { Archive, AlertTriangle, Copy, EllipsisVertical, Loader2, Trash } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { usePathname, useRouter } from "next/navigation";
import { notify } from "@/components/ui/sonner";

import SlideScale from "@/app/(presentation-generator)/components/PresentationRender";
import {
  shouldRenderTemplateV2HtmlPreview,
  TemplateV2HtmlSlidePreview,
} from "@/app/(presentation-generator)/components/TemplateV2HtmlSlidePreview";
import MarkdownRenderer from "@/components/MarkDownRender";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";

export const PresentationCard = ({
  id,
  title,
  presentation,
  viewMode = "grid",
  onDeleted,
  onDuplicated
}: {
  id: string;
  title: string;
  presentation: any;
  viewMode?: "grid" | "list";
  onDeleted?: (presentationId: string) => void;
  onDuplicated?: (presentation: any) => void;
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isDuplicating, setIsDuplicating] = React.useState(false);
  const isUnsupported = presentation?.version === "v1-standard";
  const presentationType =
    presentation?.generation_mode === "smart" ? "smart" : "standard";

  const handlePreview = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isUnsupported) {
      notify.warning(
        "不支持此演示文稿",
        "该演示文稿由较旧版本创建，请使用兼容版本打开。"
      );
      return;
    }
    trackEvent(MixpanelEvent.Dashboard_Presentation_Opened, {
      pathname,
      presentation_id: id,
      title_length: (title || "").length,
      slide_count: presentation?.slides?.length || 0,
      presentation_type: presentationType,
    });
    router.push(`/presentation?id=${id}&type=${presentationType}`);
  };


  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    const response = await DashboardApi.deletePresentation(id);

    if (response?.success) {
      trackEvent(MixpanelEvent.Dashboard_Presentation_Deleted, {
        pathname,
        presentation_id: id,
        slide_count: presentation?.slides?.length || 0,
      });
      notify.success("演示文稿已删除", "已从工作台移除该演示文稿。");
      setShowDeleteDialog(false);
      if (onDeleted) {
        onDeleted(id);
      }
    } else {
      notify.error("无法删除演示文稿", response?.message || "删除演示文稿时出现问题。");
    }
    setIsDeleting(false);
  };

  const handleDuplicate = async () => {
    if (isDuplicating) return;
    setIsDuplicating(true);
    try {
      const duplicated = await DashboardApi.duplicatePresentation(id);
      trackEvent(MixpanelEvent.Dashboard_Presentation_Duplicated, {
        pathname,
        presentation_id: id,
        duplicate_presentation_id: duplicated?.id,
        slide_count: presentation?.slides?.length || 0,
      });
      notify.success("演示文稿已复制", "副本已添加到工作台。");
      onDuplicated?.(duplicated);
    } catch (error) {
      notify.error(
        "无法复制演示文稿",
        error instanceof Error ? error.message : "复制演示文稿时出现问题。"
      );
    } finally {
      setIsDuplicating(false);
    }
  };
  const firstSlide = presentation?.slides?.[0];
  const useTemplateV2HtmlPreview = shouldRenderTemplateV2HtmlPreview(
    firstSlide,
    presentation?.version
  );
  return (
    <Card
      suppressHydrationWarning={true}
      onClick={handlePreview}
      aria-disabled={isUnsupported}
      title={isUnsupported ? "当前版本不支持" : undefined}
      className={`bg-[#F8FBFB] font-syne relative shadow-none sm:shadow-none presentation-card rounded-[12px] p-0 group transition-all duration-500 slide-theme overflow-hidden flex flex-col ${
        isUnsupported
          ? "cursor-not-allowed border-[#EDEEEF]"
          : "cursor-pointer hover:shadow-md"
      }`}
    >
     
      <div
        id={`dashboard-presentation-card-${id}`}
        suppressHydrationWarning={true}
        className={`relative z-40 flex flex-1 ${viewMode === "list" ? "min-h-[122px] flex-row" : "flex-col"}`}
      >
        {/* <p className=" text-xs font-syne absolute top-2 flex gap-1 capitalize  items-center left-2 rounded-[100px]  px-2.5 py-1 bg-[#3A3A3AF5] text-white font-semibold  z-40 ">

          {presentation.type}
        </p> */}

        <img src="/card_bg.svg" alt="" className="absolute top-0 left-0 w-full h-full object-cover" />
        <div className={isUnsupported
          ? `relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-[#EDEEEF] bg-white/90 ${viewMode === "list" ? "m-3 w-[170px] shrink-0" : "mx-5 mt-4"}`
          : `relative aspect-video overflow-hidden bg-white ${viewMode === "list" ? "m-3 w-[170px] shrink-0 rounded-lg border border-[#EDEEEF]" : "w-full border-b border-[#EDEEEF]"}`
        }>

          {isUnsupported ? (
            <div className="flex flex-col items-center gap-2 px-5 text-center text-[#666666]">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F4F3FF] text-[#7A5AF8]">
                <Archive className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <p className="text-xs font-medium">无法预览</p>
            </div>
          ) : useTemplateV2HtmlPreview ? (
            <TemplateV2HtmlSlidePreview
              slide={firstSlide}
              fonts={presentation.fonts}
            />
          ) : (
            <SlideScale
              slide={firstSlide}
              fonts={presentation.fonts}
              isClickable={false}
              presentationLayout={presentation.layout}
            />
          )}
        </div>
        <p
          className={`absolute left-2 top-2 z-40 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize shadow-sm backdrop-blur-sm ${
            presentationType === "smart"
              ? "bg-[#F4F0FF]/95 text-[#6941C6]"
              : "bg-white/90 text-[#475467]"
          }`}
        >
          {presentationType === "smart" ? "智能模式" : "标准模式"}
        </p>
        <p className="absolute right-2 top-2 z-40 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-[#191919] shadow-sm backdrop-blur-sm">
          {presentation.n_slides ?? presentation?.slides?.length ?? 0}
        </p>
        <div className={`z-40 flex bg-white px-5 py-3 ${viewMode === "list" ? "min-w-0 flex-1 items-center border-l border-[#EDEEEF]" : "relative mt-auto w-full border-t border-[#EDEEEF]"}`}>
          <div className="flex items-center justify-between gap-7 w-full">
            <div className="flex flex-col items-start gap-1">
              <div className="text-sm text-[#191919] font-semibold  overflow-hidden line-clamp-1">
                <MarkdownRenderer content={title} className="text-sm mb-0  font-syne text-[#191919] font-semibold  overflow-hidden line-clamp-1" />
              </div>
              <p className="text-[#808080] text-sm font-syne">
                {new Date(presentation?.created_at).toLocaleDateString()}
              </p>

            </div>
            <Popover>
              <PopoverTrigger className="w-6 h-6 hover:bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700" onClick={(e) => e.stopPropagation()}>
                <EllipsisVertical className="w-6 h-6 text-gray-500" />
              </PopoverTrigger>
              <PopoverContent align="end" className="bg-white w-[200px]">
                {!isUnsupported && (
                  <button
                    className="flex items-center justify-between w-full px-2 py-1 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isDuplicating}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleDuplicate();
                    }}
                  >
                    <p>{isDuplicating ? "正在复制……" : "复制"}</p>
                    {isDuplicating ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                    ) : (
                      <Copy className="h-4 w-4 text-gray-500" />
                    )}
                  </button>
                )}
                <button
                  className="flex items-center justify-between w-full px-2 py-1 hover:bg-gray-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                >
                  <p>删除</p>
                  <Trash className="w- h-4 text-red-500" />
                </button>
              </PopoverContent>
            </Popover>
          </div>

        </div>
      </div>
      {showDeleteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center animate-[fadeIn_150ms_ease-out]"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isDeleting) return;
            setShowDeleteDialog(false);
          }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          <div
            className="relative w-[360px] rounded-2xl bg-white shadow-2xl animate-[scaleIn_200ms_ease-out]"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="flex flex-col items-center p-6 pb-4 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-[#191919]">
                删除演示文稿？
              </h3>
              <p className="text-sm leading-relaxed text-gray-500">
                即将删除
                <span className="font-medium text-gray-700">“{title}”</span>，
                此操作无法撤销。
              </p>
            </div>
            <div className="flex border-t border-gray-100">
              <button
                onClick={() => setShowDeleteDialog(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-3.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={isDeleting}
                className="flex flex-1 items-center justify-center gap-2 border-l border-gray-100 px-4 py-3.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在删除……
                  </>
                ) : (
                  "删除"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
