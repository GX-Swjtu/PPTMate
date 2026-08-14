"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { notify } from "@/components/ui/sonner";
import type { TemplateV2Layout } from "@/components/slide-editor/importing/template-v2-import";
import {
  createChartInsertElements,
  createElementInsertElements,
  createImageInsertContent,
  createInfographicInsertElements,
  createTableInsertElements,
  createTextInsertElements,
  type EditorInsertContent,
} from "@/components/slide-editor/insert/insert-elements";
import {
  TEMPLATE_V2_INSERT_ELEMENTS_EVENT,
  type TemplateV2InsertComponent,
  type TemplateV2InsertElementsDetail,
} from "@/components/slide-editor/events/events";
import {
  EDITOR_STAGE_HEIGHT,
  EDITOR_STAGE_WIDTH,
  type SlideElement,
} from "@/components/slide-editor/types";
import { COMMIT_TEMPLATE_V2_INLINE_TEXT_EVENT } from "@/components/slide-editor/text/TiptapInlineTextEditor";
import { normalizeBackendAssetUrls } from "@/utils/api";
import { ensureTailwindBrowserScript } from "@/lib/tailwind-browser";
import TemplateService from "../../services/api/template";
import { useTemplateDetails } from "../../hooks/useTemplateDetails";
import {
  useFontLoader as loadFontAssets,
} from "../../hooks/useFontLoad";
import type {
  PaletteItem,
  TemplateBlock,
} from "../../presentation/components/PresentationActions";
import { DeleteTemplateDialog } from "./editor/DeleteTemplateDialog";
import { EditorActionBar } from "./editor/EditorActionBar";
import { LayoutsPanel } from "./editor/LayoutsPanel";
import { ResponsiveSlideFrame } from "./editor/ResponsiveSlideFrame";
import { TemplateEditorHeader } from "./editor/TemplateEditorHeader";
import {
  SchemaPanel,
  TemplateInsertPanel,
  ToolRail,
} from "./editor/TemplatePreviewSidePanels";
import {
  TemplatePreviewErrorState,
  TemplatePreviewLoadingState,
  TemplatePreviewNotFoundState,
} from "./editor/TemplatePreviewStates";
import { ThumbnailStrip } from "./editor/ThumbnailStrip";
import {
  applyTemplateContentDensity,
  buildTemplateSavePayload,
  cloneLayout,
  collectSchemaFields,
  extractCreatedLayouts,
  mergeDensityPreviewCanvasEdits,
  readLayoutId,
  updateLayoutSchemaConstraint,
  updateLayoutSchemaDecoration,
  updateLayoutSchemaField,
  updateLayoutMetadata,
  type Density,
  type HistoryAvailability,
  type HistoryCommand,
  type PanelMode,
  type SchemaField,
  type UnknownRecord,
} from "./editor/templatePreviewUtils";
import {
  ANALYTICS_EVENTS,
  getPresentationErrorProperties,
  track,
  useAnalyticsPageView,
} from "./editor/templatePreviewAnalytics";
import { TemplateV2PromptOverlay } from "../../_shared/TemplateV2PromptOverlay";

type GroupLayoutPreviewProps = {
  useKonvaTemplateV2Preview?: boolean;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordArray(record: UnknownRecord, key: string) {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function nextBlankLayoutId(layouts: TemplateV2Layout[]) {
  const existingIds = new Set(
    layouts.map((layout, index) => readLayoutId(layout, index)),
  );
  let suffix = layouts.length + 1;
  let candidate = `blank-slide-${suffix}`;

  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `blank-slide-${suffix}`;
  }

  return candidate;
}

function blankLayoutWithFullSlideRectangle(layoutId: string): TemplateV2Layout {
  return {
    id: layoutId,
    description: "Blank slide layout.",
    components: [
      {
        id: `${layoutId}-rectangle`,
        description: "Full-slide rectangle",
        position: { x: 0, y: 0 },
        size: {
          width: EDITOR_STAGE_WIDTH,
          height: EDITOR_STAGE_HEIGHT,
        },
        elements: [
          {
            type: "vector",
            shape: "polygon",
            points: [
              { x: 0, y: 0 },
              { x: EDITOR_STAGE_WIDTH, y: 0 },
              { x: EDITOR_STAGE_WIDTH, y: EDITOR_STAGE_HEIGHT },
              { x: 0, y: EDITOR_STAGE_HEIGHT },
            ],
            closed: true,
            fill: { color: "#FFFFFF" },
          },
        ],
      },
    ],
  };
}

const GroupLayoutPreview = ({
  useKonvaTemplateV2Preview = true,
}: GroupLayoutPreviewProps) => {
  void useKonvaTemplateV2Preview;

  const searchParams = useSearchParams();
  const router = useRouter();
  const templateId =
    searchParams.get("templateV2Id") || searchParams.get("id") || "";

  const { template, layouts, fonts, loading, error } =
    useTemplateDetails(templateId);
  const [editableLayouts, setEditableLayouts] = useState<TemplateV2Layout[]>([]);
  const editableLayoutsRef = useRef<TemplateV2Layout[]>([]);
  const [activeLayoutIndex, setActiveLayoutIndex] = useState(0);
  const [activePanel, setActivePanel] = useState<PanelMode>("schema");
  const [density, setDensity] = useState<Density>("");
  const [openFieldId, setOpenFieldId] = useState("");
  const [templateNameDraft, setTemplateNameDraft] = useState("未命名模板");
  const [savedTemplateName, setSavedTemplateName] = useState("未命名模板");
  const [historyCommand, setHistoryCommand] = useState<HistoryCommand | null>(
    null,
  );
  const [historyAvailability, setHistoryAvailability] =
    useState<HistoryAvailability>({
      canUndo: false,
      canRedo: false,
    });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReconstructing, setIsReconstructing] = useState(false);
  const [promptLayoutId, setPromptLayoutId] = useState<string | null>(null);
  const [isPromptGenerating, setIsPromptGenerating] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);
  const loadOutcomeTrackedRef = useRef(false);

  useAnalyticsPageView(() => {
    track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_PAGE_VIEWED, {
      page_path: "/template-preview",
      template_id: templateId || undefined,
      has_template_id: Boolean(templateId),
    });
  });

  useEffect(() => {
    loadOutcomeTrackedRef.current = false;
  }, [templateId]);

  useEffect(() => {
    if (loading || loadOutcomeTrackedRef.current) return;
    loadOutcomeTrackedRef.current = true;

    if (error || !template) {
      track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_LOAD_FAILED, {
        template_id: templateId || undefined,
        reason: !templateId ? "template_id_missing" : "template_not_available",
        ...getPresentationErrorProperties(error),
      });
      return;
    }

    track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_LOADED, {
      template_id: templateId,
      template_source: template.is_default ? "default" : "custom",
      layout_count: layouts.length,
      can_edit: !template.is_default,
    });
  }, [error, layouts.length, loading, template, templateId]);

  useEffect(() => {
    ensureTailwindBrowserScript();
  }, []);

  useEffect(() => {
    if (!fonts || typeof fonts !== "object") return;
    loadFontAssets(fonts as Record<string, string>);
  }, [fonts]);

  useEffect(() => {
    editableLayoutsRef.current = layouts;
    setEditableLayouts(layouts);
    setActiveLayoutIndex(0);
    setDensity("");
    setOpenFieldId("");
    setHistoryAvailability({ canUndo: false, canRedo: false });
    setHistoryCommand(null);
    setHasUnsavedChanges(false);
    setPromptLayoutId(null);
    setIsPromptGenerating(false);
    setIsDeleteDialogOpen(false);
    setIsDeletingTemplate(false);
  }, [layouts, templateId]);

  useEffect(() => {
    const nextName = template?.name?.trim() || "未命名模板";
    setTemplateNameDraft(nextName);
    setSavedTemplateName(nextName);
  }, [template?.name, templateId]);

  const canEditTemplate = Boolean(template && !template.is_default);
  const activeLayout = editableLayouts[activeLayoutIndex] ?? null;
  const previewLayouts = useMemo(
    () =>
      editableLayouts.map((layout) =>
        applyTemplateContentDensity(layout, density),
      ),
    [density, editableLayouts],
  );
  const activePreviewLayout = previewLayouts[activeLayoutIndex] ?? null;
  const activeLayoutId = activeLayout
    ? readLayoutId(activeLayout, activeLayoutIndex)
    : "slide-1";
  const activeLayoutToken = templateId
    ? `${templateId}:${activeLayoutId}`
    : activeLayoutId;
  const schemaFields = useMemo(
    () => (activeLayout ? collectSchemaFields(activeLayout) : []),
    [activeLayout],
  );

  useEffect(() => {
    if (schemaFields.length === 0) {
      setOpenFieldId("");
      return;
    }
    setOpenFieldId((current) => {
      const currentField = schemaFields.find((field) => field.id === current);
      if (currentField) return current;

      return (
        schemaFields.find((field) => !field.decorative) ?? schemaFields[0]
      ).id;
    });
  }, [schemaFields]);

  useEffect(() => {
    setHistoryCommand(null);
    setHistoryAvailability({ canUndo: false, canRedo: false });
  }, [activeLayoutIndex]);

  const copyLayoutId = useCallback(async (layoutIndex: number) => {
    const layout = editableLayouts[layoutIndex];
    if (!layout) return;

    const layoutToken = templateId
      ? `${templateId}:${readLayoutId(layout, layoutIndex)}`
      : readLayoutId(layout, layoutIndex);

    try {
      await navigator.clipboard.writeText(layoutToken);
      track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_LAYOUT_ID_COPIED, {
        template_id: templateId,
        layout_index: layoutIndex,
      });
      notify.success("复制成功", "模板版式 ID 已复制。");
    } catch {
      notify.error("复制失败", layoutToken);
    }
  }, [editableLayouts, templateId]);

  const copyActiveLayoutId = useCallback(async () => {
    await copyLayoutId(activeLayoutIndex);
  }, [activeLayoutIndex, copyLayoutId]);

  const copyTemplateId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(templateId);
      track(ANALYTICS_EVENTS.TEMPLATE_ID_COPIED, {
        template_id: templateId,
      });
      notify.success("复制成功", "模板 ID 已复制。");
    } catch (copyError) {
      notify.error(
        "复制失败",
        copyError instanceof Error ? copyError.message : templateId,
      );
    }
  }, [templateId]);

  const commitTemplateName = useCallback(async () => {
    if (!templateId || !template) return;
    if (!canEditTemplate) {
      setTemplateNameDraft(savedTemplateName);
      return;
    }

    const nextName = templateNameDraft.trim() || "未命名模板";
    if (nextName !== templateNameDraft) {
      setTemplateNameDraft(nextName);
    }
    if (nextName === savedTemplateName) return;

    setHasUnsavedChanges(true);
  }, [
    canEditTemplate,
    savedTemplateName,
    template,
    templateId,
    templateNameDraft,
  ]);

  const cancelTemplateNameEdit = useCallback(() => {
    setTemplateNameDraft(savedTemplateName);
  }, [savedTemplateName]);

  const updateEditableLayouts = useCallback(
    (
      updater: (currentLayouts: TemplateV2Layout[]) => TemplateV2Layout[],
    ) => {
      const nextLayouts = updater(editableLayoutsRef.current);
      editableLayoutsRef.current = nextLayouts;
      setEditableLayouts(nextLayouts);
    },
    [],
  );

  const updateActiveLayout = useCallback(
    (layout: TemplateV2Layout) => {
      if (!canEditTemplate) return;
      updateEditableLayouts((currentLayouts) =>
        currentLayouts.map((currentLayout, index) =>
          index === activeLayoutIndex ? layout : currentLayout,
        ),
      );
      setHasUnsavedChanges(true);
    },
    [activeLayoutIndex, canEditTemplate, updateEditableLayouts],
  );

  const handlePreviewLayoutChange = useCallback(
    (layout: TemplateV2Layout) => {
      if (!activeLayout) return;
      updateActiveLayout(
        density
          ? mergeDensityPreviewCanvasEdits(activeLayout, layout)
          : layout,
      );
    },
    [activeLayout, density, updateActiveLayout],
  );

  const applyContentDensity = useCallback((nextDensity: Density) => {
    if (!nextDensity || !canEditTemplate || !activeLayout) return;
    const hasEditableContent = schemaFields.some(
      (field) =>
        !field.decorative &&
        (field.type === "text" ||
          field.type === "text-list" ||
          field.type === "image"),
    );
    if (!hasEditableContent) {
      notify.warning(
        "没有可编辑内容",
        "请先将一个结构字段设为非装饰元素，再测试内容密度。",
      );
      return;
    }

    setDensity(nextDensity);
    track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_SCHEMA_CHANGED, {
      template_id: templateId,
      layout_index: activeLayoutIndex,
      change_type: "content_density",
      density: nextDensity.toLowerCase(),
    });
  }, [
    activeLayout,
    activeLayoutIndex,
    canEditTemplate,
    schemaFields,
    templateId,
  ]);

  const resetContentDensity = useCallback(() => {
    if (!density) return;
    setDensity("");
    track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_SCHEMA_CHANGED, {
      template_id: templateId,
      layout_index: activeLayoutIndex,
      change_type: "content_density_reset",
    });
  }, [activeLayoutIndex, density, templateId]);

  const handleLayoutMetadataChange = useCallback(
    (
      layoutIndex: number,
      field: "id" | "description",
      value: string,
    ) => {
      if (!canEditTemplate) return;
      updateEditableLayouts((currentLayouts) =>
        currentLayouts.map((layout, index) =>
          index === layoutIndex
            ? updateLayoutMetadata(layout, field, value)
            : layout,
        ),
      );
      setHasUnsavedChanges(true);
    },
    [canEditTemplate, updateEditableLayouts],
  );

  const selectLayout = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= editableLayouts.length) return;
      if (nextIndex === activeLayoutIndex) return;

      resetContentDensity();
      setPromptLayoutId(null);
      track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_LAYOUT_SELECTED, {
        template_id: templateId,
        layout_index: nextIndex,
        previous_layout_index: activeLayoutIndex,
        layout_count: editableLayouts.length,
      });
      setActiveLayoutIndex(nextIndex);
    },
    [
      activeLayoutIndex,
      editableLayouts.length,
      resetContentDensity,
      templateId,
    ],
  );

  const handleSchemaFieldChange = useCallback(
    (field: SchemaField, value: string) => {
      if (!activeLayout) return;
      const updatedLayout = updateLayoutSchemaField(activeLayout, field, value);
      updateActiveLayout(
        field.type === "image"
          ? normalizeBackendAssetUrls(updatedLayout)
          : updatedLayout,
      );
      track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_SCHEMA_CHANGED, {
        template_id: templateId,
        layout_index: activeLayoutIndex,
        change_type: "field",
        field_id: field.id,
      });
    },
    [activeLayout, activeLayoutIndex, templateId, updateActiveLayout],
  );

  const handleSchemaConstraintChange = useCallback(
    (field: SchemaField, constraint: "min" | "max", value: string) => {
      if (!activeLayout) return;
      updateActiveLayout(
        updateLayoutSchemaConstraint(activeLayout, field, constraint, value),
      );
      track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_SCHEMA_CHANGED, {
        template_id: templateId,
        layout_index: activeLayoutIndex,
        change_type: "constraint",
        constraint,
        field_id: field.id,
      });
    },
    [activeLayout, activeLayoutIndex, templateId, updateActiveLayout],
  );

  const handleSchemaDecorationChange = useCallback(
    (field: SchemaField, decorative: boolean) => {
      if (!activeLayout) return;
      updateActiveLayout(
        updateLayoutSchemaDecoration(activeLayout, field, decorative),
      );
      track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_SCHEMA_CHANGED, {
        template_id: templateId,
        layout_index: activeLayoutIndex,
        change_type: "decorative",
        decorative,
        field_id: field.id,
      });
    },
    [activeLayout, activeLayoutIndex, templateId, updateActiveLayout],
  );

  const runHistoryCommand = useCallback((action: "undo" | "redo") => {
    resetContentDensity();
    setHistoryCommand({ action, token: Date.now() });
    track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_HISTORY_ACTION, {
      template_id: templateId,
      layout_index: activeLayoutIndex,
      action,
    });
  }, [activeLayoutIndex, resetContentDensity, templateId]);

  const duplicateActiveLayout = useCallback(() => {
    if (!canEditTemplate || !activeLayout) return;
    resetContentDensity();
    const duplicated = cloneLayout(activeLayout) as UnknownRecord;
    const nextId = `${activeLayoutId}-copy`;
    duplicated.id = nextId;
    updateEditableLayouts((currentLayouts) => {
      const nextLayouts = [...currentLayouts];
      nextLayouts.splice(
        activeLayoutIndex + 1,
        0,
        duplicated as TemplateV2Layout,
      );
      return nextLayouts;
    });
    setActiveLayoutIndex((index) => index + 1);
    setHasUnsavedChanges(true);
    track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_LAYOUT_DUPLICATED, {
      template_id: templateId,
      layout_index: activeLayoutIndex,
      layout_count_before: editableLayouts.length,
      layout_count_after: editableLayouts.length + 1,
    });
  }, [
    activeLayout,
    activeLayoutId,
    activeLayoutIndex,
    canEditTemplate,
    editableLayouts.length,
    resetContentDensity,
    templateId,
    updateEditableLayouts,
  ]);

  const createBlankLayout = useCallback(() => {
    if (!canEditTemplate) return;
    resetContentDensity();

    const blankLayout = blankLayoutWithFullSlideRectangle(
      nextBlankLayoutId(editableLayoutsRef.current),
    );
    const nextIndex =
      editableLayoutsRef.current.length === 0
        ? 0
        : Math.min(
            activeLayoutIndex + 1,
            editableLayoutsRef.current.length,
          );

    updateEditableLayouts((currentLayouts) => {
      const nextLayouts = [...currentLayouts];
      nextLayouts.splice(nextIndex, 0, blankLayout);
      return nextLayouts;
    });
    setActiveLayoutIndex(nextIndex);
    setPromptLayoutId(
      typeof blankLayout.id === "string" ? blankLayout.id : null,
    );
    setHasUnsavedChanges(true);
  }, [
    activeLayoutIndex,
    canEditTemplate,
    resetContentDensity,
    updateEditableLayouts,
  ]);

  const generatePromptedLayout = useCallback(
    async (prompt: string) => {
      if (
        !canEditTemplate ||
        !templateId ||
        !promptLayoutId ||
        isPromptGenerating
      ) {
        return false;
      }

      const targetIndex = editableLayoutsRef.current.findIndex(
        (layout, index) => readLayoutId(layout, index) === promptLayoutId,
      );
      if (targetIndex < 0) {
        notify.error(
          "幻灯片不可用",
          "该空白幻灯片已不可用，请新建一张后重试。",
        );
        setPromptLayoutId(null);
        return false;
      }

      setIsPromptGenerating(true);
      const startedAt = Date.now();
      try {
        const response = await TemplateService.generateTemplateLayout({
          template_id: templateId,
          prompt,
        });
        if (!isRecord(response.layout)) {
          throw new Error("未返回已生成的版式。");
        }
        const generatedLayout = normalizeBackendAssetUrls(response.layout);

        updateEditableLayouts((currentLayouts) =>
          currentLayouts.map((currentLayout, index) => {
            if (readLayoutId(currentLayout, index) !== promptLayoutId) {
              return currentLayout;
            }

            const generatedId = readLayoutId(generatedLayout, targetIndex);
            const idIsAlreadyUsed = currentLayouts.some(
              (candidate, candidateIndex) =>
                readLayoutId(candidate, candidateIndex) === generatedId &&
                readLayoutId(candidate, candidateIndex) !== promptLayoutId,
            );

            return {
              ...generatedLayout,
              id: idIsAlreadyUsed ? promptLayoutId : generatedId,
            };
          }),
        );
        setPromptLayoutId(null);
        setHasUnsavedChanges(true);
        notify.success(
          "幻灯片已创建",
          `第 ${targetIndex + 1} 张幻灯片已生成，请保存以保留更改。`,
        );
        track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_LAYOUT_RECONSTRUCTED, {
          template_id: templateId,
          layout_index: targetIndex,
          duration_ms: Date.now() - startedAt,
          source: "blank_slide_prompt",
        });
        return true;
      } catch (generationError) {
        notify.error(
          "创建幻灯片失败",
          generationError instanceof Error
            ? generationError.message
            : "创建此幻灯片时发生错误。",
        );
        track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_LAYOUT_RECONSTRUCT_FAILED, {
          template_id: templateId,
          layout_index: targetIndex,
          duration_ms: Date.now() - startedAt,
          source: "blank_slide_prompt",
          ...getPresentationErrorProperties(generationError),
        });
        return false;
      } finally {
        setIsPromptGenerating(false);
      }
    },
    [
      canEditTemplate,
      isPromptGenerating,
      promptLayoutId,
      templateId,
      updateEditableLayouts,
    ],
  );

  const moveActiveLayout = useCallback(
    (direction: -1 | 1) => {
      const nextIndex = activeLayoutIndex + direction;
      if (!canEditTemplate) return;
      if (nextIndex < 0 || nextIndex >= editableLayouts.length) return;
      resetContentDensity();
      updateEditableLayouts((currentLayouts) => {
        const nextLayouts = [...currentLayouts];
        const [layout] = nextLayouts.splice(activeLayoutIndex, 1);
        if (!layout) return currentLayouts;
        nextLayouts.splice(nextIndex, 0, layout);
        return nextLayouts;
      });
      setActiveLayoutIndex(nextIndex);
      setHasUnsavedChanges(true);
      track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_LAYOUT_MOVED, {
        template_id: templateId,
        from_index: activeLayoutIndex,
        to_index: nextIndex,
        layout_count: editableLayouts.length,
      });
    },
    [
      activeLayoutIndex,
      canEditTemplate,
      editableLayouts.length,
      resetContentDensity,
      templateId,
      updateEditableLayouts,
    ],
  );

  const deleteActiveLayout = useCallback(() => {
    if (!canEditTemplate) return;
    if (editableLayouts.length <= 1) {
      notify.warning(
        "无法删除幻灯片",
        "模板至少需要保留一个版式。",
      );
      return;
    }

    resetContentDensity();
    setPromptLayoutId(null);
    updateEditableLayouts((currentLayouts) =>
      currentLayouts.filter((_, index) => index !== activeLayoutIndex),
    );
    setActiveLayoutIndex((index) =>
      Math.max(0, Math.min(index, editableLayouts.length - 2)),
    );
    setHasUnsavedChanges(true);
    track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_LAYOUT_DELETED, {
      template_id: templateId,
      layout_index: activeLayoutIndex,
      layout_count_before: editableLayouts.length,
      layout_count_after: editableLayouts.length - 1,
    });
  }, [
    activeLayoutIndex,
    canEditTemplate,
    editableLayouts.length,
    resetContentDensity,
    templateId,
    updateEditableLayouts,
  ]);

  const reconstructActiveLayout = useCallback(async () => {
    if (!canEditTemplate || !templateId || !activeLayout || isReconstructing) {
      return;
    }

    resetContentDensity();
    setIsReconstructing(true);
    const startedAt = Date.now();
    track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_LAYOUT_RECONSTRUCT_REQUESTED, {
      template_id: templateId,
      layout_index: activeLayoutIndex,
    });
    try {
      const response = await TemplateService.createTemplateLayout({
        template_id: templateId,
        index: activeLayoutIndex,
      });
      const createdLayout = extractCreatedLayouts(response).find(
        (item) => item.index === activeLayoutIndex,
      );
      if (!createdLayout) {
        throw new Error("未返回重新生成的版式。");
      }

      updateActiveLayout(normalizeBackendAssetUrls(createdLayout.layout));
      notify.success(
        "幻灯片已重新生成",
        `第 ${activeLayoutIndex + 1} 张幻灯片已重新生成，请保存以保留更改。`,
      );
      track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_LAYOUT_RECONSTRUCTED, {
        template_id: templateId,
        layout_index: activeLayoutIndex,
        duration_ms: Date.now() - startedAt,
      });
    } catch (reconstructError) {
      notify.error(
        "重新生成幻灯片失败",
        reconstructError instanceof Error
          ? reconstructError.message
          : "重新生成此幻灯片时发生错误。",
      );
      track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_LAYOUT_RECONSTRUCT_FAILED, {
        template_id: templateId,
        layout_index: activeLayoutIndex,
        duration_ms: Date.now() - startedAt,
        ...getPresentationErrorProperties(reconstructError),
      });
    } finally {
      setIsReconstructing(false);
    }
  }, [
    activeLayout,
    activeLayoutIndex,
    canEditTemplate,
    isReconstructing,
    resetContentDensity,
    templateId,
    updateActiveLayout,
  ]);

  const insertEditorContent = useCallback(
    (
      content: EditorInsertContent,
      label: string,
      preserveComponentData = false,
    ) => {
      if (!canEditTemplate || !activeLayout || typeof window === "undefined") {
        if (!activeLayout) {
          notify.warning(
            "请先创建版式",
            "插入内容前，请先添加一个空白版式。",
          );
        }
        return false;
      }
      if (
        (content.elements?.length ?? 0) === 0 &&
        (content.components?.length ?? 0) === 0
      ) {
        return false;
      }

      const detail: TemplateV2InsertElementsDetail = {
        ...content,
        label,
        preserveComponentData,
        slideId: activeLayoutId,
        slideIndex: activeLayoutIndex,
      };
      window.dispatchEvent(
        new CustomEvent(TEMPLATE_V2_INSERT_ELEMENTS_EVENT, { detail }),
      );

      if (!detail.handled) {
        notify.warning(
          "无法插入",
          "请选择当前版式后重试。",
        );
        return false;
      }

      return true;
    },
    [
      activeLayout,
      activeLayoutId,
      activeLayoutIndex,
      canEditTemplate,
    ],
  );

  const insertEditorElements = useCallback(
    (elements: SlideElement[], label: string) =>
      insertEditorContent({ elements }, label),
    [insertEditorContent],
  );

  const handleTextItemSelect = useCallback(
    (item: PaletteItem) => {
      if (!insertEditorElements(createTextInsertElements(item.id), item.label)) {
        return;
      }
      track(ANALYTICS_EVENTS.EDITOR_PALETTE_ITEM_INSERTED, {
        template_id: templateId,
        category: "texts",
        item_id: item.id,
        layout_index: activeLayoutIndex,
      });
    },
    [activeLayoutIndex, insertEditorElements, templateId],
  );

  const handleChartItemSelect = useCallback(
    (item: PaletteItem) => {
      const chartElements = createChartInsertElements(item.id);
      const category = chartElements.length > 0 ? "charts" : "infographics";
      const elements =
        chartElements.length > 0
          ? chartElements
          : createInfographicInsertElements(item.id);
      if (!insertEditorElements(elements, item.label)) return;

      track(ANALYTICS_EVENTS.EDITOR_PALETTE_ITEM_INSERTED, {
        template_id: templateId,
        category,
        item_id: item.id,
        layout_index: activeLayoutIndex,
      });
    },
    [activeLayoutIndex, insertEditorElements, templateId],
  );

  const handleTableItemSelect = useCallback(
    (item: PaletteItem) => {
      if (
        !insertEditorElements(createTableInsertElements(item.id), item.label)
      ) {
        return;
      }
      track(ANALYTICS_EVENTS.EDITOR_PALETTE_ITEM_INSERTED, {
        template_id: templateId,
        category: "tables",
        item_id: item.id,
        layout_index: activeLayoutIndex,
      });
    },
    [activeLayoutIndex, insertEditorElements, templateId],
  );

  const handleImageItemSelect = useCallback(
    (item: PaletteItem) => {
      if (!insertEditorContent(createImageInsertContent(item.id), item.label)) {
        return;
      }
      track(ANALYTICS_EVENTS.EDITOR_PALETTE_ITEM_INSERTED, {
        template_id: templateId,
        category: "images",
        item_id: item.id,
        layout_index: activeLayoutIndex,
      });
    },
    [activeLayoutIndex, insertEditorContent, templateId],
  );

  const handleElementItemSelect = useCallback(
    (item: PaletteItem) => {
      if (
        !insertEditorElements(createElementInsertElements(item.id), item.label)
      ) {
        return;
      }
      track(ANALYTICS_EVENTS.EDITOR_PALETTE_ITEM_INSERTED, {
        template_id: templateId,
        category: "elements",
        item_id: item.id,
        layout_index: activeLayoutIndex,
      });
    },
    [activeLayoutIndex, insertEditorElements, templateId],
  );

  const handleBlockSelect = useCallback(
    (block: TemplateBlock) => {
      if (
        !isRecord(block.raw) ||
        recordArray(block.raw, "elements").length === 0
      ) {
        notify.warning(
          "组件不可用",
          "暂时无法插入此合并组件。",
        );
        return;
      }

      const inserted = insertEditorContent(
        { components: [block.raw as TemplateV2InsertComponent] },
        block.title,
        true,
      );
      if (inserted) {
        track(ANALYTICS_EVENTS.EDITOR_TEMPLATE_BLOCK_INSERTED, {
          template_id: templateId,
          block_index: block.index,
          layout_index: activeLayoutIndex,
          element_count: recordArray(block.raw, "elements").length,
        });
      }
    },
    [activeLayoutIndex, insertEditorContent, templateId],
  );

  const saveTemplate = useCallback(async () => {
    let layoutsToSave = editableLayoutsRef.current;
    if (
      !canEditTemplate ||
      !templateId ||
      !template ||
      layoutsToSave.length === 0
    ) {
      return;
    }

    setIsSaving(true);
    const startedAt = Date.now();
    try {
      // Save can be clicked while Tiptap still has an update queued for the
      // active text element. Force that editor to flush and close before the
      // request takes its layout snapshot.
      window.dispatchEvent(
        new Event(COMMIT_TEMPLATE_V2_INLINE_TEXT_EVENT),
      );
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      layoutsToSave = editableLayoutsRef.current;

      track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_TEMPLATE_SAVE_REQUESTED, {
        template_id: templateId,
        layout_count: layoutsToSave.length,
        had_unsaved_changes: hasUnsavedChanges,
      });

      const nextTemplateName = templateNameDraft.trim() || "未命名模板";
      if (nextTemplateName !== templateNameDraft) {
        setTemplateNameDraft(nextTemplateName);
      }

      const targetTemplateId = template.id || templateId;
      const payload = buildTemplateSavePayload({
        layouts: layoutsToSave,
        name: nextTemplateName,
        targetTemplateId,
        template,
      });
      await TemplateService.updateTemplate(targetTemplateId, payload);

      setHasUnsavedChanges(false);
      setSavedTemplateName(nextTemplateName);
      notify.success(
        "更改已保存",
        "模板内容已更新。",
      );
      track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_TEMPLATE_SAVED, {
        template_id: templateId,
        layout_count: layoutsToSave.length,
        duration_ms: Date.now() - startedAt,
      });
    } catch (saveError) {
      notify.error(
        "保存模板失败",
        saveError instanceof Error
          ? saveError.message
          : "保存模板时发生错误。",
      );
      track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_TEMPLATE_SAVE_FAILED, {
        template_id: templateId,
        layout_count: layoutsToSave.length,
        duration_ms: Date.now() - startedAt,
        ...getPresentationErrorProperties(saveError),
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    canEditTemplate,
    hasUnsavedChanges,
    template,
    templateId,
    templateNameDraft,
  ]);

  const openDeleteTemplateDialog = useCallback(() => {
    if (!templateId || template?.is_default) return;
    setIsDeleteDialogOpen(true);
    track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_TEMPLATE_DELETE_REQUESTED, {
      template_id: templateId,
      layout_count: editableLayouts.length,
    });
  }, [editableLayouts.length, template?.is_default, templateId]);

  const confirmDeleteTemplate = useCallback(async () => {
    if (!templateId || template?.is_default || isDeletingTemplate) return;

    setIsDeletingTemplate(true);
    const startedAt = Date.now();
    try {
      const result = await TemplateService.deleteTemplate(templateId);
      if (result.success) {
        setIsDeleteDialogOpen(false);
        notify.success(
          "模板已删除",
          "模板删除成功。",
        );
        track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_TEMPLATE_DELETED, {
          template_id: templateId,
          duration_ms: Date.now() - startedAt,
        });
        router.push("/templates");
        return;
      }

      notify.error(
        "删除模板失败",
        result.message || "删除模板时发生错误。",
      );
      track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_TEMPLATE_DELETE_FAILED, {
        template_id: templateId,
        duration_ms: Date.now() - startedAt,
        error_code: "delete_rejected",
      });
    } catch (deleteError) {
      notify.error(
        "删除模板失败",
        deleteError instanceof Error
          ? deleteError.message
          : "删除模板时发生错误。",
      );
      track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_TEMPLATE_DELETE_FAILED, {
        template_id: templateId,
        duration_ms: Date.now() - startedAt,
        ...getPresentationErrorProperties(deleteError),
      });
    } finally {
      setIsDeletingTemplate(false);
    }
  }, [isDeletingTemplate, router, template?.is_default, templateId]);

  if (!templateId) {
    return (
      <TemplatePreviewNotFoundState onBack={() => router.push("/templates")} />
    );
  }

  if (loading) {
    return <TemplatePreviewLoadingState />;
  }

  if (error) {
    return (
      <TemplatePreviewErrorState
        error={error}
        onBack={() => router.push("/templates")}
      />
    );
  }

  if (!template) {
    return (
      <TemplatePreviewNotFoundState onBack={() => router.push("/templates")} />
    );
  }

  return (
    <div className="flex h-screen min-h-[764px] flex-col overflow-hidden bg-[#FBFBFA] font-syne text-[#191919]">
      <TemplateEditorHeader
        activeLayoutToken={activeLayoutToken}
        canEdit={canEditTemplate}
        canRedo={historyAvailability.canRedo}
        canUndo={historyAvailability.canUndo}
        canDelete={!template.is_default}
        hasUnsavedChanges={hasUnsavedChanges}
        isSaving={isSaving}
        templateName={templateNameDraft}
        onBack={() => router.push("/templates")}
        onCopy={copyTemplateId}
        onDelete={openDeleteTemplateDialog}
        onTemplateNameCancel={cancelTemplateNameEdit}
        onTemplateNameChange={setTemplateNameDraft}
        onTemplateNameCommit={commitTemplateName}
        onRedo={() => runHistoryCommand("redo")}
        onSave={saveTemplate}
        onUndo={() => runHistoryCommand("undo")}
      />

      <main className="flex min-h-0 flex-1  overflow-hidden bg-[#FBFBFA]">
        <section className="flex min-w-0 flex-1 gap-1 flex-col bg-[#FBFBFA]">
          {editableLayouts.length === 0 ||
            !activeLayout ||
            !activePreviewLayout ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-sm text-[#696969]">
              <p>此模板暂无可用版式。</p>
              {canEditTemplate ? (
                <button
                  className="rounded-[8px] border border-[#D9D6FE] bg-white px-4 py-2 text-[13px] font-medium text-[#7A5AF8] transition-colors hover:bg-[#F8F6FF]"
                  onClick={createBlankLayout}
                  type="button"
                >
                  创建空白版式
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col mb-2">
                <ResponsiveSlideFrame
                  activeLayoutIndex={activeLayoutIndex}
                  canEdit={canEditTemplate}
                  fonts={fonts}
                  historyCommand={historyCommand}
                  isGenerating={isReconstructing}
                  layout={activePreviewLayout}
                  onHistoryAvailabilityChange={setHistoryAvailability}
                  onLayoutChange={handlePreviewLayoutChange}
                  promptOverlay={
                    promptLayoutId === activeLayoutId ? (
                      <TemplateV2PromptOverlay
                        isSubmitting={isPromptGenerating}
                        layout={activeLayout}
                        slideIndex={activeLayoutIndex}
                        onDismiss={() => setPromptLayoutId(null)}
                        onSubmitPrompt={generatePromptedLayout}
                      />
                    ) : null
                  }
                />
              </div>

              {canEditTemplate ? (
                <EditorActionBar
                  canDeleteSlide={editableLayouts.length > 1}
                  canMoveLeft={activeLayoutIndex > 0}
                  canMoveRight={activeLayoutIndex < editableLayouts.length - 1}
                  isReconstructing={isReconstructing}
                  onAddBlank={createBlankLayout}
                  onCopy={copyActiveLayoutId}
                  onDelete={deleteActiveLayout}
                  onDuplicate={duplicateActiveLayout}
                  onMoveLeft={() => moveActiveLayout(-1)}
                  onMoveRight={() => moveActiveLayout(1)}
                  onReconstruct={reconstructActiveLayout}
                />
              ) : null}

              <ThumbnailStrip
                activeLayoutIndex={activeLayoutIndex}
                fonts={fonts}
                layouts={previewLayouts}
                templateId={templateId}
                onSelect={selectLayout}
              />
            </>
          )}
        </section>

        {canEditTemplate ? (
          <>
            <ToolRail
              activePanel={activePanel}
              onPanelChange={(nextPanel) => {
                if (nextPanel !== "schema") {
                  resetContentDensity();
                }
                track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_PANEL_SELECTED, {
                  template_id: templateId,
                  panel: nextPanel,
                  previous_panel: activePanel,
                });
                setActivePanel(nextPanel);
              }}
            />
            {activePanel === "layouts" ? (
              <LayoutsPanel
                activeLayoutIndex={activeLayoutIndex}
                layouts={editableLayouts}
                onCopyLayoutId={copyLayoutId}
                onLayoutIdChange={(layoutIndex, value) =>
                  handleLayoutMetadataChange(layoutIndex, "id", value)
                }
                onLayoutDescriptionChange={(layoutIndex, value) =>
                  handleLayoutMetadataChange(layoutIndex, "description", value)
                }
                onSelectLayout={selectLayout}
              />
            ) : activePanel === "schema" ? (
              <SchemaPanel
                canResetDensity={density !== ""}
                density={density}
                fields={schemaFields}
                openFieldId={openFieldId}
                onConstraintChange={handleSchemaConstraintChange}
                onDecorativeChange={handleSchemaDecorationChange}
                onDensityChange={applyContentDensity}
                onDensityReset={resetContentDensity}
                onFieldChange={handleSchemaFieldChange}
                onOpenFieldChange={setOpenFieldId}
              />
            ) : (
              <TemplateInsertPanel
                activePanel={activePanel}
                onBlockSelect={handleBlockSelect}
                onChartItemSelect={handleChartItemSelect}
                onElementItemSelect={handleElementItemSelect}
                onImageItemSelect={handleImageItemSelect}
                onTableItemSelect={handleTableItemSelect}
                onTextItemSelect={handleTextItemSelect}
                template={template}
                templateId={templateId}
              />
            )}
          </>
        ) : null}
      </main>

      <DeleteTemplateDialog
        isDeleting={isDeletingTemplate}
        open={isDeleteDialogOpen}
        templateName={
          templateNameDraft.trim() || template?.name || "此模板"
        }
        onConfirm={confirmDeleteTemplate}
        onOpenChange={setIsDeleteDialogOpen}
      />
    </div>
  );
};

export default GroupLayoutPreview;
