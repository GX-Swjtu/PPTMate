"use client";

import React, { type FormEvent } from "react";
import {
  ArrowUp,
  BarChart3,
  Edit3,
  Image as ImageIcon,
  Info,
  List,
  Minus,
  Plus,
  RotateCcw,
  Rows3,
  Shapes,
  Sparkles,
  Type,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Density, PanelMode, SchemaField } from "./templatePreviewUtils";
import {
  BlocksPanel,
  InsertPanel,
  chartTypeItems,
  elementItemGroups,
  imageItems,
  infographicItems,
  tableTypeItems,
  textItems,
  type PaletteItem,
  type TemplateBlock,
} from "../../../presentation/components/PresentationActions";

type RailIcon = React.ComponentType<{ className?: string }>;

function BlocksIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      viewBox="0 0 14 14"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.333 8.166h3.5M2.333 1.166h5.834"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.083 10.5H2.917a.583.583 0 0 0-.584.583v1.167c0 .322.262.583.584.583h8.166a.583.583 0 0 0 .584-.583v-1.167a.583.583 0 0 0-.584-.583ZM11.083 3.5H2.917a.583.583 0 0 0-.584.583V5.25c0 .322.262.583.584.583h8.166a.583.583 0 0 0 .584-.583V4.083a.583.583 0 0 0-.584-.583Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const insertNavItems: Array<{
  id: PanelMode;
  label: string;
  Icon: RailIcon;
}> = [
  { id: "blocks", label: "内容块", Icon: BlocksIcon },
  { id: "texts", label: "文本", Icon: Type },
  { id: "charts", label: "图表", Icon: BarChart3 },
  { id: "tables", label: "表格", Icon: Rows3 },
  { id: "images", label: "图片", Icon: ImageIcon },
  { id: "elements", label: "元素", Icon: Shapes },
];

const templateNavItems: Array<{
  id: PanelMode;
  label: string;
  Icon: RailIcon;
}> = [
  { id: "schema", label: "结构", Icon: Edit3 },
  { id: "layouts", label: "版式", Icon: List },
];

function ToolRailButton({
  active,
  Icon,
  label,
  onClick,
}: {
  active: boolean;
  Icon: RailIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex w-[58px] shrink-0 flex-col items-center justify-center gap-[6px] rounded-[10px] py-[7px] text-[11px] font-medium leading-none transition-colors",
        active
          ? "text-[#7A5AF8]"
          : "text-[#191919] hover:bg-[#F8F8FA]",
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-transparent",
          active &&
            "border-[#EDEEEF] bg-white shadow-[0_6px_13px_rgba(124,81,248,0.14)]",
        )}
      >
        <Icon className="h-[14px] w-[14px]" />
      </span>
      {label}
    </button>
  );
}

export function ToolRail({
  activePanel,
  onPanelChange,
}: {
  activePanel: PanelMode;
  onPanelChange: (panel: PanelMode) => void;
}) {
  return (
    <div className="hide-scrollbar hidden w-[70px] shrink-0 flex-col items-center overflow-y-auto bg-[#FEFEFF] px-[6px] py-2 lg:flex">
      <div className="flex w-full shrink-0 flex-col items-center gap-1 rounded-[10px] bg-[rgba(244,243,255,0.6)] py-3">
        {templateNavItems.map(({ id, label, Icon }, index) => (
          <React.Fragment key={id}>
            {index > 0 ? (
              <div className="h-px w-[30px] shrink-0 bg-[#EDEEEF]" />
            ) : null}
            <ToolRailButton
              active={activePanel === id}
              Icon={Icon}
              label={label}
              onClick={() => onPanelChange(id)}
            />
          </React.Fragment>
        ))}
      </div>

      <div className="my-3 h-px w-[30px] shrink-0 bg-[#EDEEEF]" />

      <nav className="flex w-full shrink-0 flex-col items-center gap-1">
        {insertNavItems.map(({ id, label, Icon }, index) => (
          <React.Fragment key={id}>
            <ToolRailButton
              active={activePanel === id}
              Icon={Icon}
              label={label}
              onClick={() => onPanelChange(id)}
            />
            {index < insertNavItems.length - 1 ? (
              <div className="h-px w-[30px] shrink-0 bg-[#EDEEEF]" />
            ) : null}
          </React.Fragment>
        ))}
      </nav>
    </div>
  );
}

export function TemplateInsertPanel({
  activePanel,
  onBlockSelect,
  onChartItemSelect,
  onElementItemSelect,
  onImageItemSelect,
  onTableItemSelect,
  onTextItemSelect,
  template,
  templateId,
}: {
  activePanel: PanelMode;
  onBlockSelect: (block: TemplateBlock) => void;
  onChartItemSelect: (item: PaletteItem) => void;
  onElementItemSelect: (item: PaletteItem) => void;
  onImageItemSelect: (item: PaletteItem) => void;
  onTableItemSelect: (item: PaletteItem) => void;
  onTextItemSelect: (item: PaletteItem) => void;
  template: unknown;
  templateId: string;
}) {
  return (
    <aside className="hidden w-[299px] shrink-0 overflow-hidden bg-[#FEFEFF] lg:block">
      {activePanel === "blocks" ? (
        <BlocksPanel
          presentationData={template}
          presentationId={templateId}
          onInsertBlock={onBlockSelect}
        />
      ) : activePanel === "texts" ? (
        <InsertPanel
          title="文本"
          groups={[{ label: "添加", items: textItems }]}
          onItemSelect={onTextItemSelect}
        />
      ) : activePanel === "charts" ? (
        <InsertPanel
          title="图表"
          groups={[
            { label: "图表类型", items: chartTypeItems },
            { label: "信息图", items: infographicItems },
          ]}
          onItemSelect={onChartItemSelect}
        />
      ) : activePanel === "tables" ? (
        <InsertPanel
          title="表格"
          groups={[{ label: "表格类型", items: tableTypeItems }]}
          onItemSelect={onTableItemSelect}
        />
      ) : activePanel === "images" ? (
        <InsertPanel
          title="图片"
          groups={[{ label: "添加", items: imageItems }]}
          onItemSelect={onImageItemSelect}
        />
      ) : activePanel === "elements" ? (
        <InsertPanel
          title="元素"
          groups={elementItemGroups}
          onItemSelect={onElementItemSelect}
        />
      ) : null}
    </aside>
  );
}

export function AiPanel({
  prompt,
  onPromptChange,
  onSubmit,
}: {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
}) {
  const quickPrompts = [
    { label: "精简内容", prompt: "Make it shorter" },
    { label: "增强吸引力", prompt: "Make it more engaging" },
  ];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <aside className="relative hidden w-[299px] shrink-0 overflow-hidden bg-[#FEFEFF] lg:flex lg:flex-col">
      <div className="pointer-events-none absolute left-[22px] top-[100px] h-[390px] w-[260px] rounded-full bg-[radial-gradient(circle_at_52%_47%,rgba(83,177,253,0.28)_0%,rgba(217,214,254,0.35)_38%,rgba(255,255,255,0)_72%)] blur-[30px]" />

      <div className="relative flex min-h-0 flex-1 flex-col px-3 pb-6 pt-[132px]">
        <div className="flex flex-1 items-start justify-center pt-[58px] text-center">
          <p className="text-[22.68px] font-normal leading-[24.3px] tracking-[-0.4536px] text-[#4C4C4C]">
            今天想如何完善
            <br />
            你的演示文稿？
          </p>
        </div>

        <form className="mt-auto" onSubmit={submit}>
          <div className="rounded-[8px] border border-[#EDEEEF] bg-white p-[10px] shadow-none">
            <Textarea
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder={"请输入需求。\n输入 / 查看快捷提示。"}
              className="min-h-[79px] resize-none border-0 bg-transparent p-0 text-[14px] font-normal leading-[18px] text-[#191919] shadow-none placeholder:text-[#999999] focus-visible:ring-0"
            />
            <div className="mt-2 flex h-[28px] items-center justify-between">
              <div className="flex items-center gap-[6px]">
                <button
                  type="button"
                  className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-[#EDEEEF] text-[#191919]"
                  title="添加"
                >
                  <Plus className="h-[14px] w-[14px]" />
                </button>
                <button
                  type="button"
                  className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-[#EDEEEF] text-[#191919]"
                  title="AI 选项"
                >
                  <Sparkles className="h-[13px] w-[13px] text-[#7A5AF8]" />
                </button>
                <button
                  type="button"
                  className="flex h-[28px] items-center gap-[6px] rounded-full border border-[#EDEEEF] px-[10px] text-[12px] font-medium text-[#191919]"
                >
                  <Sparkles className="h-[13px] w-[13px] text-[#7A5AF8]" />
                  提示词
                </button>
              </div>
              <button
                type="submit"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EFEFF2] text-[#191919] disabled:text-[#9A9A9A]"
                disabled={!prompt.trim()}
                title="发送"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </div>
        </form>

        <div className="mt-[13px] flex flex-wrap gap-[8px]">
          {quickPrompts.map((quickPrompt) => (
            <button
              key={quickPrompt.prompt}
              className="h-[28px] rounded-full border border-[#EDEEEF] bg-white px-[12px] text-[12px] font-medium text-[#666666] transition-colors hover:bg-[#F7F6F9]"
              onClick={() => onPromptChange(quickPrompt.prompt)}
              type="button"
            >
              {quickPrompt.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function DensitySelector({
  density,
  onDensityChange,
}: {
  density: Density;
  onDensityChange: (density: Density) => void;
}) {
  const options: Exclude<Density, "">[] = ["Low", "Medium", "High"];
  const labels: Record<Exclude<Density, "">, string> = {
    Low: "低",
    Medium: "中",
    High: "高",
  };

  return (
    <div className="mt-[12px] grid grid-cols-3 gap-[8px]">
      {options.map((option) => (
        <button
          key={option}
          aria-pressed={density === option}
          className={cn(
            "h-[30px] rounded-[6px] border text-[14px] font-normal transition-colors",
            density === option
              ? "border-[#D9D6FE] bg-[#F8F6FF] text-[#7A5AF8]"
              : "border-[#EDEEEF] bg-white text-[#191919] hover:bg-[#F8F8F8]",
          )}
          onClick={() => onDensityChange(option)}
          title={
            density === option
              ? `已选择${labels[option]}内容密度`
              : `预览${labels[option]}内容密度`
          }
          type="button"
        >
          {labels[option]}
        </button>
      ))}

    </div>
  );
}

export function SchemaPanel({
  canResetDensity,
  density,
  fields,
  openFieldId,
  onConstraintChange,
  onDecorativeChange,
  onDensityChange,
  onDensityReset,
  onFieldChange,
  onOpenFieldChange,
}: {
  canResetDensity: boolean;
  density: Density;
  fields: SchemaField[];
  openFieldId: string;
  onConstraintChange: (
    field: SchemaField,
    constraint: "min" | "max",
    value: string,
  ) => void;
  onDecorativeChange: (field: SchemaField, decorative: boolean) => void;
  onDensityChange: (density: Density) => void;
  onDensityReset: () => void;
  onFieldChange: (field: SchemaField, value: string) => void;
  onOpenFieldChange: (fieldId: string) => void;
}) {
  const fieldGroups = [
    {
      id: "non-decorative",
      label: "内容",
      fields: fields.filter((field) => !field.decorative),
    },
    {
      id: "decorative",
      label: "装饰",
      fields: fields.filter((field) => field.decorative),
    },
  ];

  return (
    <aside className="hidden w-[299px] shrink-0 bg-[#FEFEFF] lg:flex lg:flex-col">
      <div className="px-3 pt-[33px]">
        <h2 className="text-[18px] font-medium text-[#101323]">
          结构编辑器
        </h2>
        <div className="mt-[18px] flex items-center justify-between gap-3">
          <p className="text-[14px] font-normal text-[#191919]">
            内容密度
          </p>
          <button
            aria-label="重置内容密度预览"
            className="flex h-7 items-center gap-1.5 rounded-[6px] border border-[#EDEEEF] bg-white px-2 text-[11px] font-medium text-[#667085] transition-colors hover:border-[#D9D6FE] hover:bg-[#F8F6FF] hover:text-[#7A5AF8] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canResetDensity}
            onClick={onDensityReset}
            title="恢复原始幻灯片内容"
            type="button"
          >
            <RotateCcw className="h-3 w-3" />
            重置
          </button>
        </div>
        <DensitySelector density={density} onDensityChange={onDensityChange} />
        <div className="mt-[10px] flex min-h-[62px] gap-[10px] rounded-[6px] bg-[#F3F6FB] px-[16px] py-[10px] text-[12px] leading-[14px] text-[#5F6470]">
          <Info className="mt-[2px] h-[14px] w-[14px] shrink-0 text-[#1F5FBF]" />
          <p>
            在不修改已保存模板的情况下预览不同内容长度，重置后可恢复原始内容。
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-[40px]">
        {fields.length === 0 ? (
          <div className="rounded-[6px] border border-dashed border-[#DCDCE1] px-4 py-8 text-center text-[13px] text-[#808080]">
            此版式中没有找到结构元素。
          </div>
        ) : (
          <div className="space-y-6">
            {fieldGroups.map((group) => (
              <section key={group.id}>
                <div className="mb-2 flex items-center justify-between px-0.5">
                  <h3 className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#667085]">
                    {group.label}
                  </h3>
                  <span className="rounded-full bg-[#F2F4F7] px-2 py-0.5 text-[10px] text-[#667085]">
                    {group.fields.length}
                  </span>
                </div>
                {group.fields.length === 0 ? (
                  <div className="rounded-[6px] border border-dashed border-[#E4E7EC] px-3 py-4 text-center text-[11px] text-[#98A2B3]">
                    暂无{group.label}元素。
                  </div>
                ) : (
                  <div className="space-y-[8px]">
                    {group.fields.map((field) => (
                      <SchemaFieldRow
                        key={field.id}
                        field={field}
                        isOpen={openFieldId === field.id}
                        onChange={(value) => onFieldChange(field, value)}
                        onConstraintChange={(constraint, value) =>
                          onConstraintChange(field, constraint, value)
                        }
                        onDecorativeChange={(decorative) =>
                          onDecorativeChange(field, decorative)
                        }
                        onToggle={() =>
                          onOpenFieldChange(
                            openFieldId === field.id ? "" : field.id,
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function SchemaFieldRow({
  field,
  isOpen,
  onChange,
  onConstraintChange,
  onDecorativeChange,
  onToggle,
}: {
  field: SchemaField;
  isOpen: boolean;
  onChange: (value: string) => void;
  onConstraintChange: (constraint: "min" | "max", value: string) => void;
  onDecorativeChange: (decorative: boolean) => void;
  onToggle: () => void;
}) {
  const Icon =
    field.type === "image"
      ? ImageIcon
      : field.type === "element"
        ? Shapes
        : Type;
  const typeLabel =
    field.type === "text-list"
      ? "列表"
      : field.type === "image"
        ? field.elementType === "icon"
          ? "图标"
          : "图片"
        : field.type === "element"
          ? field.elementType
              .replace(/[_-]+/g, " ")
              .replace(/\b\w/g, (letter) => letter.toUpperCase())
          : "文本";

  return (
    <div className="space-y-[3px]">
      <div className="flex h-[30px] items-center">
        <button
          className="flex h-[12px] w-[14px] shrink-0 items-center justify-center rounded-[2px] border border-[#D9D9DE] bg-[#F7F8FA] text-[#808080]"
          onClick={onToggle}
          type="button"
        >
          {isOpen ? (
            <Minus className="h-[10px] w-[10px]" />
          ) : (
            <Plus className="h-[10px] w-[10px]" />
          )}
        </button>
        <span className="h-px w-[14.5px] shrink-0 bg-[#D9D9DE]" />
        <button
          className={cn(
            "flex h-[30px] min-w-0 flex-1 items-center gap-[8px] rounded-[4px] border bg-[#FEFEFF] px-[10px] text-left transition-colors",
            isOpen
              ? "border-[#D9D6FE] text-[#191919]"
              : "border-[#EDEEEF] text-[#191919] hover:bg-[#F8F8F8]",
          )}
          onClick={onToggle}
          type="button"
        >
          <Icon className="h-[14px] w-[14px] shrink-0 text-[#7A5AF8]" />
          <span className="min-w-0 truncate text-[14px] font-normal tracking-[0.56px]">
            {field.label}
          </span>
          {field.maxChars ? (
            <span
              className="shrink-0 text-[12px] font-normal tracking-[0.48px] text-[#808080]"
              style={{ fontFamily: "Outfit, var(--font-syne), sans-serif" }}
            >
              （{field.maxChars} 个字符）
            </span>
          ) : null}
        </button>
      </div>

      {isOpen ? (
        <div className="ml-[28.5px] flex flex-col gap-[2px]">
          <div className="flex h-[30px] items-center gap-[8px] rounded-[4px] border border-[#E7E8EC] bg-[#FEFEFF] px-[10px] text-[14px] font-normal tracking-[0.56px] text-[#17181E]">
            <span className="text-[16px] leading-none text-[#808080]">#</span>
            <span>类型</span>
            <span className="ml-auto text-[#191919]">{typeLabel}</span>
          </div>
          <div className="flex h-[36px] items-center rounded-[4px] border border-[#E7E8EC] bg-[#FEFEFF] px-[10px] text-[14px] font-normal tracking-[0.56px] text-[#17181E]">
            <span>装饰元素</span>
            <Switch
              aria-label={`将 ${field.label} 设为装饰元素`}
              checked={field.decorative}
              className="ml-auto data-[state=checked]:bg-[#7A5AF8] data-[state=unchecked]:bg-[#D0D5DD]"
              onCheckedChange={onDecorativeChange}
            />
          </div>
          {field.decorative ? (
            <div className="rounded-[4px] border border-[#E7E8EC] bg-[#F8F8FA] px-[10px] py-[8px] text-[11px] leading-4 tracking-normal text-[#667085]">
              装饰元素为只读。关闭“装饰元素”后，可编辑其内容或约束。
            </div>
          ) : null}
          {field.type === "text" || field.type === "text-list" ? (
            <>
              <label className="flex h-[30px] items-center rounded-[4px] border border-[#E7E8EC] bg-[#FEFEFF] px-[10px] text-[14px] font-normal tracking-[0.56px] text-[#17181E]">
                <span>最少字符数</span>
                <input
                  className={cn(
                    "ml-auto h-[24px] w-[76px] rounded-[4px] border border-transparent bg-transparent text-right text-[#191919] outline-none transition-colors focus:border-[#D9D6FE] focus:bg-[#F8F6FF]",
                    field.decorative &&
                      "cursor-default bg-[#F8F8FA] text-[#667085] focus:border-transparent",
                  )}
                  min={0}
                  onChange={(event) =>
                    onConstraintChange("min", event.target.value)
                  }
                  readOnly={field.decorative}
                  type="number"
                  value={field.minChars ?? ""}
                />
              </label>
              <label className="flex h-[30px] items-center rounded-[4px] border border-[#E7E8EC] bg-[#FEFEFF] px-[10px] text-[14px] font-normal tracking-[0.56px] text-[#17181E]">
                <span>最多字符数</span>
                <input
                  className={cn(
                    "ml-auto h-[24px] w-[76px] rounded-[4px] border border-transparent bg-transparent text-right text-[#191919] outline-none transition-colors focus:border-[#D9D6FE] focus:bg-[#F8F6FF]",
                    field.decorative &&
                      "cursor-default bg-[#F8F8FA] text-[#667085] focus:border-transparent",
                  )}
                  min={0}
                  onChange={(event) =>
                    onConstraintChange("max", event.target.value)
                  }
                  readOnly={field.decorative}
                  type="number"
                  value={field.maxChars ?? ""}
                />
              </label>
            </>
          ) : null}
          {field.type !== "element" ? (
            <label className="flex flex-col gap-[6px] rounded-[4px] border border-[#E7E8EC] bg-[#FEFEFF] px-[10px] py-[8px] text-[14px] font-normal tracking-[0.56px] text-[#17181E]">
              <span>{field.type === "image" ? "提示词" : "内容"}</span>
              {field.type === "image" ? (
                <input
                  className={cn(
                    "h-[30px] rounded-[4px] border border-[#E7E8EC] bg-white px-[8px] text-[13px] tracking-normal text-[#191919] outline-none transition-colors focus:border-[#D9D6FE]",
                    field.decorative &&
                      "cursor-default bg-[#F8F8FA] text-[#667085] focus:border-[#E7E8EC]",
                  )}
                  onChange={(event) => onChange(event.target.value)}
                  readOnly={field.decorative}
                  value={field.value}
                />
              ) : (
                <textarea
                  className={cn(
                    "min-h-[72px] resize-y rounded-[4px] border border-[#E7E8EC] bg-white px-[8px] py-[6px] text-[13px] leading-[17px] tracking-normal text-[#191919] outline-none transition-colors focus:border-[#D9D6FE]",
                    field.decorative &&
                      "cursor-default resize-none bg-[#F8F8FA] text-[#667085] focus:border-[#E7E8EC]",
                  )}
                  onChange={(event) => onChange(event.target.value)}
                  readOnly={field.decorative}
                  value={field.value}
                />
              )}
            </label>
          ) : (
            <p className="rounded-[4px] border border-[#E7E8EC] bg-[#F8F8FA] px-[10px] py-[8px] text-[11px] leading-4 tracking-normal text-[#667085]">
              此元素没有可编辑内容，但仍可更改其装饰属性。
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
