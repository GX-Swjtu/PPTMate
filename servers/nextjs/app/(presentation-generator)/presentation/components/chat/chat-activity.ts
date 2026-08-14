import type { ChatStreamTrace } from "../../../services/api/chat";
import type { AssistantActivity } from "./chat-types";

const TOOL_LABELS: Record<string, string> = {
  addOutline: "添加大纲",
  updateOutline: "编辑大纲",
  deleteOutline: "删除大纲",
  addNewSlide: "添加空白幻灯片",
  addNewSlideLayout: "添加版式幻灯片",
  getAvailableLayouts: "查找版式",
  getTemplateSummary: "读取模板",
  readSourceDocuments: "读取来源文档",
  searchSlide: "搜索幻灯片",
  getSlideAtIndex: "读取幻灯片",
  saveSlide: "保存幻灯片",
  updateSlide: "更新幻灯片",
  deleteSlide: "删除幻灯片",
  addElement: "添加元素",
  updateElement: "更新元素",
  deleteElement: "删除元素",
  addComponent: "添加组件",
  createComponent: "创建组件",
  updateComponent: "更新组件",
  deleteComponent: "删除组件",
  getPresentationTheme: "读取主题",
  setPresentationTheme: "应用主题",
  generateAssets: "生成素材",
};

export const MUTATING_TOOLS = new Set([
  "addOutline",
  "updateOutline",
  "deleteOutline",
  "addNewSlide",
  "addNewSlideLayout",
  "saveSlide",
  "updateSlide",
  "deleteSlide",
  "addElement",
  "updateElement",
  "deleteElement",
  "addComponent",
  "createComponent",
  "updateComponent",
  "deleteComponent",
  "setPresentationTheme",
]);

// Read/open traces can happen ahead of edits and would make follow mode jumpy.
export const SLIDE_FOCUS_TOOLS = new Set([
  "addNewSlide",
  "addNewSlideLayout",
  "saveSlide",
  "updateSlide",
  "deleteSlide",
  "addElement",
  "updateElement",
  "deleteElement",
  "addComponent",
  "createComponent",
  "updateComponent",
  "deleteComponent",
]);

export const SLIDE_FOCUS_STATUSES = new Set(["start"]);
export const MIN_SLIDE_FOCUS_DWELL_MS = 700;

const getToolLabel = (tool?: string) => {
  if (!tool) return "";
  return TOOL_LABELS[tool] ?? tool;
};

const humanizeTraceMessage = (message: string, tool?: string) => {
  const trimmed = message.trim();
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();
  const exactMessages: Record<string, string> = {
    "reading deck context": "正在查看演示文稿上下文。",
    "reading the presentation outline": "正在读取演示文稿大纲。",
    "reading the outline draft": "正在读取大纲草稿。",
    "adding an outline slide": "正在添加大纲幻灯片。",
    "updating the outline slide": "正在更新大纲幻灯片。",
    "deleting the outline slide": "正在删除大纲幻灯片。",
    "reordering outline slides": "正在调整大纲幻灯片顺序。",
    "searching relevant slides": "正在搜索相关幻灯片内容。",
    "opening the requested slide": "正在打开所选幻灯片。",
    "checking available themes": "正在检查可用配色主题。",
    "checking available layouts": "正在检查可用版式。",
    "checking the layout schema": "正在验证幻灯片结构。",
    "generating slide assets": "正在生成图片和图标。",
    "saving the slide": "正在保存幻灯片更新。",
    "deleting the slide": "正在删除幻灯片。",
    "applying presentation theme": "正在应用所选主题。",
    "reading template structure": "正在读取模板结构。",
    "reading source documents": "正在读取来源文档。",
    "opening the requested template slide": "正在打开所选模板幻灯片。",
    "searching template content": "正在搜索模板内容。",
    "finding editable elements": "正在查找可编辑元素。",
    "updating template content": "正在更新模板内容。",
    "deleting the template component": "正在删除所选组件。",
    "swapping component variant": "正在切换组件变体。",
  };
  if (exactMessages[lower]) return exactMessages[lower];

  if (lower.startsWith("using tools:")) {
    const toolNames = trimmed
      .slice("using tools:".length)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => getToolLabel(entry));
    return toolNames.length === 0
      ? "正在规划下一步。"
      : "正在选择合适的处理方式。";
  }
  if (lower.includes("found requested data")) {
    return tool === "getSlideAtIndex"
      ? "已找到所需的幻灯片详情。"
      : "已找到所需信息。";
  }
  return trimmed;
};

export const inferStatusState = (
  status: string,
): AssistantActivity["state"] => {
  const normalized = status.trim().toLowerCase();
  if (
    [
      "preparing",
      "thinking",
      "reading",
      "searching",
      "opening",
      "generating",
      "processing",
      "finalizing",
      "saving",
    ].some((term) => normalized.includes(term))
  ) {
    return "running";
  }
  return "info";
};

export const isAbortError = (error: unknown) =>
  (error instanceof DOMException && error.name === "AbortError") ||
  (error instanceof Error &&
    error.message.toLowerCase().includes("aborted") &&
    error.message.toLowerCase().includes("request"));

export const stripBackendContextFromUserMessage = (rawMessage: string) => {
  const message = rawMessage ?? "";
  if (!message.startsWith("UI context:")) return message;

  const marker = "\nUser message:";
  const markerIndex = message.indexOf(marker);
  if (markerIndex === -1) return message;
  return message.slice(markerIndex + marker.length).trimStart();
};

const humanActivityForTool = (
  tool: string | undefined,
  state: "start" | "success",
) => {
  const isDone = state === "success";
  switch (tool) {
    case "searchSlide":
      return isDone
        ? "已找到相关内容。"
        : "正在查看内容。";
    case "getSlideAtIndex":
      return isDone ? "已检查幻灯片。" : "正在检查幻灯片。";
    case "addNewSlide":
    case "addNewSlideLayout":
    case "updateElement":
    case "updateComponent":
    case "addElement":
    case "addComponent":
    case "createComponent":
    case "updateSlide":
    case "saveSlide":
      return isDone ? "已应用更改。" : "正在应用更改。";
    case "deleteComponent":
    case "deleteElement":
    case "deleteSlide":
      return isDone
        ? "已移除所选项目。"
        : "正在移除所选项目。";
    case "generateAssets":
      return isDone
        ? "已准备视觉素材。"
        : "正在准备视觉素材。";
    case "setPresentationTheme":
      return isDone ? "已更新主题。" : "正在更新主题。";
    default:
      return isDone ? "已完成此步骤。" : "正在处理。";
  }
};

export const formatTraceActivity = (
  trace: ChatStreamTrace,
): Omit<AssistantActivity, "id"> | null => {
  if (typeof trace.message === "string" && trace.message.trim().length > 0) {
    return {
      label: humanizeTraceMessage(trace.message, trace.tool),
      kind: trace.kind,
      round: trace.round,
      tool: trace.tool,
      state:
        trace.status === "error"
          ? "error"
          : trace.status === "success"
            ? "success"
            : trace.status === "ready" || trace.status === "info"
              ? "info"
              : "running",
    };
  }
  if (trace.tool && trace.status === "start") {
    return {
      label: humanActivityForTool(trace.tool, "start"),
      kind: trace.kind,
      round: trace.round,
      tool: trace.tool,
      state: "running",
    };
  }
  if (trace.tool && trace.status === "success") {
    return {
      label: humanActivityForTool(trace.tool, "success"),
      kind: trace.kind,
      round: trace.round,
      tool: trace.tool,
      state: "success",
    };
  }
  if (trace.tool && trace.status === "error") {
    return {
      label: "无法完成此步骤。",
      kind: trace.kind,
      round: trace.round,
      tool: trace.tool,
      state: "error",
    };
  }
  if (trace.kind === "tool_plan" && Array.isArray(trace.tools) && trace.tools.length) {
    return {
      label: "正在规划下一步。",
      kind: trace.kind,
      round: trace.round,
      state: "info",
    };
  }
  return null;
};

export const readTraceSlideIndex = (trace: ChatStreamTrace) => {
  if (typeof trace.slideIndex === "number" && trace.slideIndex >= 0) {
    return trace.slideIndex;
  }
  if (typeof trace.slideNumber === "number" && trace.slideNumber > 0) {
    return trace.slideNumber - 1;
  }
  return null;
};
