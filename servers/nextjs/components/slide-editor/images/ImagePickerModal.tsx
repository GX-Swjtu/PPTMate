"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import Image from "next/image";
import {
  ArrowUp,
  ChevronRight,
  Grid2X2,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useSelector } from "react-redux";
import { ImagesApi } from "@/app/(presentation-generator)/services/api/images";
import type { ImageAssetResponse } from "@/app/(presentation-generator)/services/api/types";
import { notify } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { RootState } from "@/store/store";
import { resolveBackendAssetSource } from "@/utils/api";
import { IMAGE_PROVIDERS } from "@/utils/providerConstants";

type PickerView = "discover" | "uploads";
type PickerImageSource = "generated" | "uploaded";
type PickerImage = {
  deletable?: boolean;
  id?: string;
  prompt?: string;
  source?: PickerImageSource;
  url: string;
};

const STOCK_IMAGE_PROVIDERS = new Set(["pexels", "pixabay"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function assetToPickerImage(
  asset: ImageAssetResponse,
  source: PickerImageSource,
): PickerImage | null {
  const url = resolveBackendAssetSource(asset);
  if (!url) return null;
  return {
    deletable: source === "uploaded",
    id: asset.id,
    prompt: asset.extras?.prompt,
    source,
    url,
  };
}

function dedupePickerImages(images: PickerImage[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (!image.url || seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

function normalizedProvider(value: string | null | undefined) {
  const provider = (value || "").trim().toLowerCase();
  if (provider === "pixels" || provider === "pixel" || provider === "pexel") {
    return "pexels";
  }
  return provider;
}

export function ImagePickerModal({
  currentImage,
  initialPrompt,
  open,
  onClose,
  onSelect,
}: {
  currentImage?: string | null;
  initialPrompt?: string | null;
  open: boolean;
  onClose: () => void;
  onSelect: (url: string, prompt?: string) => void;
}) {
  const llmConfig = useSelector((state: RootState) => state.userConfig.llm_config);
  const provider = normalizedProvider(llmConfig?.IMAGE_PROVIDER);
  const stockProvider = STOCK_IMAGE_PROVIDERS.has(provider) ? provider : null;
  const providerLabel = IMAGE_PROVIDERS[provider]?.label ?? "AI 图片服务";
  const generationDisabled = Boolean(llmConfig?.DISABLE_IMAGE_GENERATION);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [view, setView] = useState<PickerView>("discover");
  const [query, setQuery] = useState(initialPrompt || "");
  const [variationCount, setVariationCount] = useState(4);
  const [discoverImages, setDiscoverImages] = useState<PickerImage[]>([]);
  const [uploadedImages, setUploadedImages] = useState<PickerImage[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSource = resolveBackendAssetSource(currentImage || "");
  const apiKey = useMemo(() => {
    if (stockProvider === "pexels") return llmConfig?.PEXELS_API_KEY;
    if (stockProvider === "pixabay") return llmConfig?.PIXABAY_API_KEY;
    return undefined;
  }, [llmConfig?.PEXELS_API_KEY, llmConfig?.PIXABAY_API_KEY, stockProvider]);

  useEffect(() => {
    if (!open) return;
    setView("discover");
    setQuery(initialPrompt || "");
    setDiscoverImages([]);
    setUploadedImages([]);
    setIsLoadingLibrary(false);
    setError(null);
    setIsDragging(false);
  }, [initialPrompt, open, provider]);

  useEffect(() => {
    if (!open || view !== "discover" || stockProvider) return;

    let cancelled = false;
    setIsLoadingLibrary(true);
    setError(null);
    ImagesApi.getGeneratedImages()
      .then((assets) => {
        if (cancelled) return;
        setDiscoverImages(
          dedupePickerImages(
            assets
              .map((asset) => assetToPickerImage(asset, "generated"))
              .filter((image): image is PickerImage => image !== null),
          ),
        );
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "无法加载已生成的图片。",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLibrary(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, stockProvider, view]);

  useEffect(() => {
    if (!open || view !== "discover" || !stockProvider) return;

    let cancelled = false;
    const starterQuery = (initialPrompt || "").trim() || "inspiration";
    setIsLoadingLibrary(true);
    setError(null);
    ImagesApi.searchStockImages(starterQuery, 24, {
      provider: stockProvider,
      apiKey,
    })
      .then((urls) => {
        if (cancelled) return;
        setDiscoverImages(
          urls.map((url) => ({ prompt: starterQuery, url })),
        );
        if (!urls.length) {
          setError("未找到推荐图片，请尝试其他搜索词。");
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "无法加载推荐图库图片。",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLibrary(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, initialPrompt, open, stockProvider, view]);

  useEffect(() => {
    if (!open || view !== "uploads" || isUploading) return;

    let cancelled = false;
    setIsLoadingLibrary(true);
    setError(null);
    ImagesApi.getUploadedImages()
      .then((assets) => {
        if (cancelled) return;
        setUploadedImages(
          dedupePickerImages(
            assets
              .map((asset) => assetToPickerImage(asset, "uploaded"))
              .filter((image): image is PickerImage => image !== null),
          ),
        );
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "无法加载已上传的图片。",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLibrary(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isUploading, open, view]);

  const chooseImage = (image: PickerImage) => {
    const prompt = image.prompt || (view === "discover" ? query.trim() : undefined);
    onSelect(image.url, prompt || undefined);
    onClose();
  };

  const searchStockImages = async () => {
    if (!stockProvider || !query.trim()) return;
    setIsWorking(true);
    setError(null);
    try {
      const urls = await ImagesApi.searchStockImages(query.trim(), 24, {
        provider: stockProvider,
        apiKey,
      });
      setDiscoverImages(
        urls.map((url) => ({ prompt: query.trim(), url })),
      );
      if (!urls.length) setError("未找到图片，请尝试其他关键词。");
    } catch (searchError: unknown) {
      setDiscoverImages([]);
      setError(
        searchError instanceof Error
          ? searchError.message
          : "图库图片搜索失败。",
      );
    } finally {
      setIsWorking(false);
    }
  };

  const generateImages = async () => {
    if (!query.trim() || generationDisabled) return;
    setIsWorking(true);
    setError(null);
    try {
      const responses = await Promise.allSettled(
        Array.from({ length: variationCount }, () =>
          ImagesApi.generateImage(query.trim()),
        ),
      );
      const images: PickerImage[] = responses.flatMap((response) => {
        if (response.status !== "fulfilled") return [];
        const url = resolveBackendAssetSource(response.value);
        return url
          ? [{ prompt: query.trim(), source: "generated" as const, url }]
          : [];
      });
      if (!images.length) {
        const failure = responses.find(
          (response): response is PromiseRejectedResult =>
            response.status === "rejected",
        );
        throw failure?.reason ?? new Error("图片生成未返回结果。");
      }
      setDiscoverImages((previous) =>
        dedupePickerImages([...images, ...previous]),
      );
      if (images.length < variationCount) {
        notify.warning(
          "部分变体生成失败",
          `请求生成 ${variationCount} 张图片，已完成 ${images.length} 张。`,
        );
      }
    } catch (generationError: unknown) {
      const message =
        generationError instanceof Error
          ? generationError.message
          : "图片生成失败。";
      setError(message);
      notify.error("图片生成失败", message);
    } finally {
      setIsWorking(false);
    }
  };

  const runDiscover = () => {
    if (!query.trim() || (generationDisabled && !stockProvider)) return;
    if (stockProvider) void searchStockImages();
    else void generateImages();
  };

  const uploadFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请上传有效的图片文件。");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("图片文件必须小于 5 MB。");
      return;
    }

    setView("uploads");
    setIsUploading(true);
    setError(null);
    try {
      const asset = await ImagesApi.uploadImage(file);
      const image = assetToPickerImage(asset, "uploaded");
      if (!image) throw new Error("上传未返回图片地址。");
      setUploadedImages((previous) => [
        image,
        ...previous.filter((item) => item.id !== image.id),
      ]);
      notify.success("图片已上传", "请从图片库中选择使用。");
    } catch (uploadError: unknown) {
      const message =
        uploadError instanceof Error ? uploadError.message : "图片上传失败。";
      setError(message);
      notify.error("上传失败", message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    void uploadFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void uploadFile(event.dataTransfer.files?.[0]);
  };

  const deleteUploadedImage = async (image: PickerImage) => {
    if (!image.deletable || !image.id) return;
    try {
      await ImagesApi.deleteImage(image.id);
      setUploadedImages((previous) =>
        previous.filter((candidate) => candidate.id !== image.id),
      );
      notify.success("图片已删除", "已从图片库中移除该上传图片。");
    } catch (deleteError: unknown) {
      notify.error(
        "无法删除图片",
        deleteError instanceof Error ? deleteError.message : "删除失败。",
      );
    }
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[10050] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-template-v2-floating-toolbar="true"
          data-inline-edit-ignore="true"
          style={{ translate: "none" }}
          className="fixed left-1/2 top-1/2 z-[10051] h-[calc(100dvh-24px)] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 font-syne text-[#191919] outline-none sm:h-[min(70vh,650px)] sm:min-h-[500px] sm:w-[min(calc(100vw-160px),977px)]"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] bg-[#F9FAFB] shadow-[0_28px_80px_rgba(0,0,0,0.34)]">
            <header className="flex h-[85px] flex-none items-center justify-between border-b border-[#EDEEEF] bg-white px-6 shadow-[0_4px_7px_rgba(0,0,0,0.04)]">
              <div>
                <DialogPrimitive.Title className="text-[18px] font-normal leading-normal">
                  更换图片
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-0.5 text-[14px] font-normal tracking-[-0.42px] text-[#808080]">
                  从图片库中选择，或上传自己的图片。
                </DialogPrimitive.Description>
              </div>
              <button
                type="button"
                aria-label="上传图片"
                title="上传图片"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex h-9 w-[100px] items-center justify-center rounded-full border border-[#EDEEEF] bg-white transition hover:bg-[#F9FAFB] disabled:cursor-wait"
              >
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" aria-hidden="true" />
                ) : (
                  <Upload className="size-4 mr-1.5" strokeWidth={1.8} aria-hidden="true" />
                )}
                上传
              </button>
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept="image/*"
                onChange={handleFileInput}
              />
            </header>

            <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
              <nav className="flex flex-none gap-1 border-b border-[#EDEEEF] bg-white p-3 sm:w-[270px] sm:flex-col sm:border-b-0 sm:border-r sm:p-5">
                <PickerNavButton
                  active={view === "discover"}
                  icon={<ImagePlus className="size-4" strokeWidth={1.7} />}
                  label="发现图片"
                  onClick={() => {
                    setView("discover");
                    setIsLoadingLibrary(false);
                    setError(null);
                  }}
                />
                <PickerNavButton
                  active={view === "uploads"}
                  icon={<Grid2X2 className="size-4" strokeWidth={1.7} />}
                  label="使用我的图片"
                  onClick={() => {
                    setView("uploads");
                    setError(null);
                  }}
                />
              </nav>

              <div
                className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white px-4 py-4 sm:pr-5"
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                    setIsDragging(false);
                  }
                }}
                onDrop={handleDrop}
              >
                {view === "discover" ? (
                  <DiscoverControls
                    disabled={generationDisabled && !stockProvider}
                    isStock={Boolean(stockProvider)}
                    isWorking={isWorking || isLoadingLibrary}
                    providerLabel={providerLabel}
                    query={query}
                    variationCount={variationCount}
                    onQueryChange={setQuery}
                    onRun={runDiscover}
                    onVariationChange={(delta) =>
                      setVariationCount((count) =>
                        Math.max(1, Math.min(4, count + delta)),
                      )
                    }
                  />
                ) : null}

                {error ? (
                  <div className="mt-3 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                    {error}
                  </div>
                ) : null}

                <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
                  {isLoadingLibrary || isWorking ? (
                    <ImageSkeletons compact={Boolean(stockProvider)} />
                  ) : view === "discover" ? (
                    <ImageResults
                      compact={Boolean(stockProvider)}
                      currentSource={currentSource}
                      images={discoverImages}
                      emptyMessage={
                        generationDisabled && !stockProvider
                          ? "系统已停用图片生成功能。"
                          : stockProvider
                            ? `在 ${providerLabel} 中搜索图片。`
                            : "描述想要创建的内容，生成的图片将显示在这里。"
                      }
                      onSelect={chooseImage}
                    />
                  ) : (
                    <ImageResults
                      compact
                      currentSource={currentSource}
                      images={uploadedImages}
                      emptyMessage="上传图片，将其添加到你的图片库。"
                      onDelete={deleteUploadedImage}
                      onSelect={chooseImage}
                    />
                  )}
                </div>

                {isDragging ? (
                  <div className="pointer-events-none absolute inset-4 z-20 flex items-center justify-center rounded-[16px] border-2 border-dashed border-[#191919] bg-white/95 text-center">
                    <div>
                      <Upload className="mx-auto mb-2 size-6" aria-hidden="true" />
                      <p className="text-[14px] font-medium">拖放图片以上传</p>
                      <p className="mt-1 text-[12px] text-[#808080]">最大文件大小：5 MB</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <DialogPrimitive.Close
            aria-label="关闭图片选择器"
            className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-white text-[#191919] shadow-sm transition hover:bg-[#F6F6F9] sm:-right-[68px] sm:top-0 sm:size-[52px]"
          >
            <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PickerNavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] px-2.5 py-3 text-left text-[14px] font-normal outline-none transition hover:bg-[#F4F4F4] focus-visible:ring-2 focus-visible:ring-[#E1E1E5] sm:w-full sm:flex-none",
        active && "bg-[#F4F4F4]",
      )}
    >
      <span className="flex-none" aria-hidden="true">{icon}</span>
      <span className="truncate">{label}</span>
      <ChevronRight className="ml-auto size-3.5 flex-none" strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

function DiscoverControls({
  disabled,
  isStock,
  isWorking,
  providerLabel,
  query,
  variationCount,
  onQueryChange,
  onRun,
  onVariationChange,
}: {
  disabled: boolean;
  isStock: boolean;
  isWorking: boolean;
  providerLabel: string;
  query: string;
  variationCount: number;
  onQueryChange: (value: string) => void;
  onRun: () => void;
  onVariationChange: (delta: number) => void;
}) {
  const canRun = query.trim().length > 0 && !isWorking && !disabled;

  if (isStock) {
    return (
      <div className="flex h-[41px] flex-none gap-2.5" aria-label={`搜索 ${providerLabel}`}>
        <label className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[8px] border border-[rgba(219,219,219,0.6)] bg-white px-2.5">
          <Search className="size-3.5 flex-none" strokeWidth={1.8} aria-hidden="true" />
          <textarea
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canRun) onRun();
            }}
            placeholder="搜索图片"
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-normal outline-none placeholder:text-[#999]"
          />
        </label>
        <button
          type="button"
          aria-label={`搜索 ${providerLabel}`}
          onClick={onRun}
          disabled={!canRun}
          className="flex w-[132px] items-center justify-center rounded-[38.4px] bg-[#EDEEEF] px-[12.8px] py-2 text-[#191919] transition hover:bg-[#E1E1E5] disabled:cursor-not-allowed disabled:text-[#999]"
        >
          {isWorking ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[76px] flex-none gap-2.5" aria-label={`使用 ${providerLabel} 生成图片`}>
      <textarea
        autoFocus
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canRun) {
            onRun();
          }
        }}
        placeholder="描述想要的图片"
        className="min-w-0 flex-1 resize-none rounded-[8px] border border-[rgba(219,219,219,0.6)] bg-white px-2.5 py-3 text-[14px] font-normal outline-none shadow-[0_4px_7px_rgba(0,0,0,0.04)] placeholder:text-[#999] focus:border-[#B9BBC1]"
      />
      <div className="flex w-[150px] flex-none flex-col gap-2.5">
        <div className="flex h-[34px] items-center rounded-full border border-[#EDEEEF] bg-white">
          <button
            type="button"
            aria-label="减少变体数量"
            disabled={variationCount <= 1 || isWorking}
            onClick={() => onVariationChange(-1)}
            className="flex h-full w-9 items-center justify-center rounded-l-full hover:bg-[#F9FAFB] disabled:opacity-35"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="flex h-4 flex-1 items-center justify-center border-x border-[#EDEEEF] text-[12px] font-semibold">
            {variationCount} 个变体
          </span>
          <button
            type="button"
            aria-label="增加变体数量"
            disabled={variationCount >= 4 || isWorking}
            onClick={() => onVariationChange(1)}
            className="flex h-full w-9 items-center justify-center rounded-r-full hover:bg-[#F9FAFB] disabled:opacity-35"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <button
          type="button"
          aria-label={`使用 ${providerLabel} 生成 ${variationCount} 个图片变体`}
          onClick={onRun}
          disabled={!canRun}
          className="flex h-8 items-center justify-center rounded-[38.4px] bg-[#EDEEEF] px-[12.8px] py-2 text-[#191919] transition hover:bg-[#E1E1E5] disabled:cursor-not-allowed disabled:text-[#999]"
        >
          {isWorking ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function ImageSkeletons({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2.5", compact && "sm:grid-cols-3 lg:grid-cols-4")}>
      {Array.from({ length: compact ? 12 : 6 }, (_, index) => (
        <div
          key={index}
          className="aspect-square animate-pulse rounded-[10px] bg-[#F6F6F9]"
        />
      ))}
    </div>
  );
}

function ImageResults({
  compact = false,
  currentSource,
  emptyMessage,
  images,
  onDelete,
  onSelect,
}: {
  compact?: boolean;
  currentSource: string;
  emptyMessage: string;
  images: PickerImage[];
  onDelete?: (image: PickerImage) => void;
  onSelect: (image: PickerImage) => void;
}) {
  if (!images.length) {
    return (
      <div className="flex h-full min-h-[220px] items-center justify-center rounded-[14px] border border-dashed border-[#E1E1E5] bg-[#F9FAFB] px-6 text-center">
        <p className="max-w-[330px] text-[13px] leading-5 text-[#808080]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-2 gap-2.5", compact && "sm:grid-cols-3 lg:grid-cols-4")}>
      {images.map((image, index) => (
        <div
          key={`${image.id || image.url}-${index}`}
          className={cn(
            "group relative aspect-square overflow-hidden rounded-[10px] border border-[#EDEEEF] bg-[#F6F6F9] text-left outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#191919]",
            image.url === currentSource && "ring-2 ring-[#191919]",
          )}
        >
          <button
            type="button"
            aria-label="使用此图片"
            onClick={() => onSelect(image)}
            className="absolute inset-0 h-full w-full overflow-hidden rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#191919]"
          >
            <Image
              fill
              unoptimized
              src={image.url}
              alt={image.prompt || ""}
              sizes={compact ? "(min-width: 1024px) 160px, 25vw" : "(min-width: 640px) 330px, 50vw"}
              className="object-cover transition duration-300 group-hover:scale-[1.025]"
            />
            <span className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/45 via-transparent to-transparent p-2 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              <span className="rounded-full bg-white/95 px-3 py-1 text-[11px] font-medium text-[#191919]">使用图片</span>
            </span>
          </button>
          {onDelete && image.deletable && image.id ? (
            <button
              type="button"
              aria-label="删除已上传图片"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(image);
              }}
              className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-white/95 text-red-600 opacity-0 shadow-sm transition hover:bg-white group-hover:opacity-100 group-focus-within:opacity-100"
            >
              <Trash2 className="size-3.5" strokeWidth={1.8} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
