"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export type GenerationMode = "standard" | "smart";

type GenerationModeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (mode: GenerationMode) => void;
};

export default function GenerationModeDialog({
  open,
  onOpenChange,
  onSelect,
}: GenerationModeDialogProps) {
  const selectMode = (mode: GenerationMode) => {
    onSelect(mode);
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#101828]/45 backdrop-blur-[2px]" />
        <div
          className="p-2"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <DialogPrimitive.Content
            className="relative overflow-y-auto rounded-[24px] border border-[#EDEEEF] bg-white p-0 shadow-[0_24px_80px_rgba(15,23,42,0.24)] sm:rounded-[40px]"
            style={{
              width: "calc(100% - 1rem)",
              maxWidth: "850px",
              maxHeight: "calc(100dvh - 1rem)",
              pointerEvents: "auto",
            }}
          >
            <DialogPrimitive.Description className="sr-only">
              标准模式使用固定版式，智能模式使用自适应版式。
            </DialogPrimitive.Description>
            <div className="sticky top-0 z-10 border-b border-[#EDEEEF] bg-[#F9FAFB] px-4 py-4 sm:px-8">
              <DialogPrimitive.Title className="text-xl font-medium tracking-[-0.2px] text-[#808080]">
                选择生成模式
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label="关闭"
                className="absolute right-4 top-5 sm:right-8"
              >
                <X className="h-5 w-5 text-[#808080]" />
              </DialogPrimitive.Close>
            </div>

        <div className="p-3 sm:p-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <div className="pb-2.5">
                <div className="aspect-[4/3] w-full overflow-hidden rounded-[18px] border border-[#EDEEEF] bg-white">
                  <video
                    src="/Standard.mp4"
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <div className="rounded-[20px] border border-[#EBE9FE] bg-[#F4F3FF] px-3.5 pb-5 pt-3.5">
                <div className="flex items-center justify-between border-b border-[#EBE9FE] pb-3.5">
                  <p className="text-xl font-medium text-[#333333]">标准模式</p>
                  <p className="text-[10px] font-medium text-[#6938EF]">
                    固定版式
                  </p>
                </div>
                <p className="mb-2 py-1.5 text-base font-medium text-[#666666]">
                  使用预定义的固定结构，版面一致、清晰，生成结果更可控。
                </p>
                <Button
                  type="button"
                  className="rounded-[80px] bg-[#7A5AF8] px-5 text-base font-medium text-white shadow-none hover:bg-[#6938EF]/90"
                  onClick={() => selectMode("standard")}
                >
                  选择标准模式
                </Button>
              </div>
            </div>

            <div>
              <div className="pb-2.5">
                <div className="aspect-[4/3] w-full overflow-hidden rounded-[18px] border border-[#EDEEEF] bg-white">
                  <video
                    src="/Smart.mp4"
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <div className="rounded-[20px] border border-[#EBE9FE] bg-[#F4F3FF] px-3.5 pb-5 pt-3.5">
                <div className="flex items-center justify-between border-b border-[#EBE9FE] pb-3.5">
                  <p className="text-xl font-medium text-[#333333]">智能模式</p>
                  <p className="text-[10px] font-medium text-[#6938EF]">
                    自适应版式
                  </p>
                </div>
                <p className="mb-2 py-1.5 text-base font-medium text-[#666666]">
                  根据内容灵活调整结构，在版面一致性与内容表达之间取得平衡。
                </p>
                <Button
                  type="button"
                  className="h-auto min-h-10 rounded-[80px] px-5 text-base font-medium text-[#101323] shadow-none"
                  style={{
                    background:
                      "linear-gradient(270deg, #D5CAFC 2.4%, #E3D2EB 27.88%, #F4DCD3 69.23%, #FDE4C2 100%)",
                  }}
                  onClick={() => selectMode("smart")}
                >
                  选择智能模式
                </Button>
              </div>
            </div>
          </div>
        </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
