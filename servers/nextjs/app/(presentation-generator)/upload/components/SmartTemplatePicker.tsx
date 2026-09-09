"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTemplateSummaries } from "../../hooks/useTemplateSummaries";
import type { TemplateListItem } from "../../services/api/template";
import {
  TemplateListCard,
  TemplateListEmptyState,
  TemplateListLoadingState,
} from "../../components/TemplateListUi";

type PickerProps = {
  selectedTemplate: TemplateListItem | null;
  onSelect: (template: TemplateListItem | null) => void;
};

type TemplateTab = "default" | "custom";

function TemplateChoices({ selectedTemplate, onSelect, tab, onTabChange }: PickerProps & {
  tab: TemplateTab;
  onTabChange: (tab: TemplateTab) => void;
}) {
  const { defaultTemplates, customTemplates, loading, error } = useTemplateSummaries();
  const templates = tab === "default" ? defaultTemplates : customTemplates;

  if (loading) return <TemplateListLoadingState />;
  if (error) return <TemplateListEmptyState message={`模板加载失败：${error}。请点击刷新重试。`} />;

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2" aria-label="模板分类">
        <Button type="button" variant={tab === "default" ? "default" : "outline"} aria-pressed={tab === "default"} onClick={() => onTabChange("default")}>
          内置模板（{defaultTemplates.length}）
        </Button>
        <Button type="button" variant={tab === "custom" ? "default" : "outline"} aria-pressed={tab === "custom"} onClick={() => onTabChange("custom")}>
          我的模板（{customTemplates.length}）
        </Button>
      </div>
      {templates.length === 0 ? (
        <TemplateListEmptyState message={tab === "custom" ? "还没有个人模板。上传 PPTX 创建后，点击刷新即可选择。" : "暂无可用的内置模板。"} />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {templates.map((template) => (
            <TemplateListCard
              key={template.id}
              template={template}
              isSelected={selectedTemplate?.id === template.id}
              onClick={() => onSelect(selectedTemplate?.id === template.id ? null : template)}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default function SmartTemplatePicker(props: PickerProps) {
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<TemplateTab>("default");

  return (
    <section aria-label="模板参考" data-testid="smart-template-picker">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#191919]">模板参考</h2>
          <p className="mt-1 text-sm leading-6 text-[#808080]">
            可选。参考模板的配色、字体和布局风格，由 AI 根据内容自由排版。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setRevision((value) => value + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />刷新模板
          </Button>
          <Button variant="outline" asChild>
            <Link href="/custom-template" target="_blank" rel="noopener noreferrer" aria-label="创建模板（新标签页）">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />创建模板
            </Link>
          </Button>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
        <Button type="button" variant={props.selectedTemplate ? "outline" : "default"} aria-pressed={!props.selectedTemplate} onClick={() => props.onSelect(null)}>
          自由设计
        </Button>
        <span className="text-[#666666]" aria-live="polite">
          {props.selectedTemplate ? `已选：${props.selectedTemplate.name}` : "不使用模板参考"}
        </span>
      </div>
      <TemplateChoices key={revision} tab={tab} onTabChange={setTab} {...props} />
    </section>
  );
}
