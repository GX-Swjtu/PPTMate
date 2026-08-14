"use client";

import React, { useRef } from "react";
import {
  ArrowRight,
  Copy,
  Edit3,
  Loader2,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SAVE_BUTTON_GRADIENT =
  "linear-gradient(270deg, rgb(213, 202, 252) 2.4038%, rgb(227, 210, 235) 27.885%, rgb(244, 220, 211) 69.231%, rgb(253, 228, 194) 100%)";

function GradientActionButton({
  children,
  className,
  style,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-[37px] items-center justify-center gap-[6px] rounded-[52.8px] px-[18px] py-[10px] text-[14px] font-medium tracking-[-0.14px] text-[#191919] transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
      style={{ backgroundImage: SAVE_BUTTON_GRADIENT, ...style }}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

type TemplateEditorHeaderProps = {
  activeLayoutToken: string;
  canEdit: boolean;
  canRedo: boolean;
  canUndo: boolean;
  canDelete: boolean;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  templateName: string;
  onBack: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onTemplateNameCancel: () => void;
  onTemplateNameChange: (name: string) => void;
  onTemplateNameCommit: () => Promise<void>;
  onRedo: () => void;
  onSave: () => void;
  onUndo: () => void;
};

export function TemplateEditorHeader({
  activeLayoutToken,
  canEdit,
  canRedo,
  canUndo,
  canDelete,
  hasUnsavedChanges,
  isSaving,
  templateName,
  onBack,
  onCopy,
  onDelete,
  onTemplateNameCancel,
  onTemplateNameChange,
  onTemplateNameCommit,
  onRedo,
  onSave,
  onUndo,
}: TemplateEditorHeaderProps) {
  const skipNameCommitRef = useRef(false);

  return (
    <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-[#EDEEEF] bg-white">
      <div className="flex h-full min-w-0 flex-1 items-center gap-[12px] px-5 text-left sm:w-[347px] sm:flex-none sm:px-[24px]">
        <button onClick={onBack} aria-label="工作台" type="button">
          <img
            src="/pptmate-mark.svg"
            alt="PPTMate"
            className="h-10 w-10 cursor-pointer object-contain"
          />
        </button>
        <label
          className={cn(
            "group flex h-[38px] min-w-0 flex-1 items-center gap-[8px] rounded-[10px] border border-transparent px-[9px] transition-colors sm:max-w-[255px]",
            canEdit
              ? "cursor-text hover:border-[#EDEEEF] hover:bg-[#FAFAFB] focus-within:border-[#B99CFF] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(124,81,248,0.10)]"
              : "cursor-default",
          )}
          title={canEdit ? "编辑模板名称" : "默认模板"}
        >
          <input
            aria-label="模板名称"
            className="h-[24px] min-w-0 flex-1 truncate bg-transparent p-0 text-[16px] font-semibold leading-normal tracking-[0.16px] text-[#101323] outline-none placeholder:text-[#9B9B9B] disabled:opacity-60"
            aria-readonly={!canEdit}
            onBlur={() => {
              if (!canEdit) return;
              if (skipNameCommitRef.current) {
                skipNameCommitRef.current = false;
                return;
              }
              void onTemplateNameCommit();
            }}
            onChange={(event) => {
              if (canEdit) {
                onTemplateNameChange(event.target.value);
              }
            }}
            onKeyDown={(event) => {
              if (!canEdit) return;
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                skipNameCommitRef.current = true;
                onTemplateNameCancel();
                event.currentTarget.blur();
              }
            }}
            placeholder="未命名模板"
            readOnly={!canEdit}
            spellCheck={false}
            tabIndex={canEdit ? 0 : -1}
            value={templateName}
          />
          {canEdit ? (
            <Edit3
              aria-hidden="true"
              className="h-[15px] w-[15px] shrink-0 text-[#9B9B9B] transition-colors group-hover:text-[#7C51F8] group-focus-within:text-[#7C51F8]"
            />
          ) : null}
        </label>
      </div>

      <div className="flex h-full min-w-0 flex-1 items-center justify-end gap-[11px] px-4 sm:px-[24px]">
        <button
          className="hidden h-[33px] items-center gap-[6px] rounded-[48px] bg-white px-[10px] py-[8px] text-[14px] font-medium text-[#101323] transition-colors hover:bg-[#F7F6F9] sm:flex"
          onClick={onCopy}
          title={activeLayoutToken}
          type="button"
        >
          复制 ID
          <Copy className="h-4 w-4" />
        </button>
        <div className="hidden h-[16.5px] w-px bg-[#EDEEEF] sm:block" />
        <div className="flex h-[34px] w-[80px] items-center justify-center gap-[10px]">
          <button
            className="flex h-[34px] w-[24px] items-center justify-center rounded-full text-[#101323] transition-colors hover:bg-[#F7F6F9] disabled:text-[#B9B9B9]"
            disabled={!canEdit || !canUndo}
            onClick={onUndo}
            title="撤销"
            type="button"
          >
            <Undo2 className="h-[14px] w-[14px]" />
          </button>
          <button
            className="flex h-[34px] w-[24px] items-center justify-center rounded-full text-[#101323] transition-colors hover:bg-[#F7F6F9] disabled:text-[#B9B9B9]"
            disabled={!canEdit || !canRedo}
            onClick={onRedo}
            title="重做"
            type="button"
          >
            <Redo2 className="h-[14px] w-[14px]" />
          </button>
        </div>
        <div className="hidden h-[16.5px] w-px bg-[#EDEEEF] sm:block" />
        {canDelete ? (
          <>
            <button
              className="hidden h-[33px] items-center gap-[6px] rounded-[48px] px-[10px] py-[8px] text-[14px] font-medium text-red-600 transition-colors hover:bg-red-50 md:flex"
              onClick={onDelete}
              title="删除模板"
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden xl:inline">删除模板</span>
            </button>
            <div className="hidden h-[16.5px] w-px bg-[#EDEEEF] md:block" />
          </>
        ) : null}
        {canEdit ? (
          <GradientActionButton
            onClick={onSave}
            disabled={isSaving}
            title={hasUnsavedChanges ? "保存更改" : "保存模板"}
          >
            {isSaving ? "保存中" : "保存"}
            {isSaving ? (
              <Loader2 className="h-[15.4px] w-[15.4px] animate-spin" />
            ) : (
              <ArrowRight className="h-[15.4px] w-[15.4px]" />
            )}
          </GradientActionButton>
        ) : null}
      </div>
    </header>
  );
}
