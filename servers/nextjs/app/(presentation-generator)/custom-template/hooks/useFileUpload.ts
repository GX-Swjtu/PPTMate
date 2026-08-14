import { useState, useCallback } from "react";
import { notify } from "@/components/ui/sonner";

export const useFileUpload = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleRawFileSelect = useCallback((file: File) => {
    const lowerName = file.name.toLowerCase();
    const isPptx = lowerName.endsWith(".pptx");
    if (!isPptx) {
      notify.error("文件格式无效", "请选择有效的 PPTX 文件。");
      return;
    }

    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      notify.error("文件过大", "文件大小必须小于 100MB。");
      return;
    }

    setSelectedFile(file);
  }, []);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      handleRawFileSelect(file);
    },
    [handleRawFileSelect]
  );

  const removeFile = useCallback(() => {
    setSelectedFile(null);
  }, []);

  return {
    selectedFile,
    handleFileSelect,
    handleRawFileSelect,
    removeFile,
  };
};
