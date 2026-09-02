"use client";

import { cn } from "@/lib/utils";

interface PresentonSplashLoaderProps {
  message?: string;
  className?: string;
}

export const PRESENTON_SPLASH_MIN_DURATION_MS = 0;

export function PresentonSplashLoader({
  message = "正在准备工作区",
  className,
}: PresentonSplashLoaderProps) {
  return (
    <main
      aria-busy="true"
      aria-label={message}
      className={cn(
        "fixed inset-0 z-[2147483000] flex min-h-screen items-center justify-center overflow-hidden bg-white",
        className,
      )}
      role="status"
    >
      <div className="flex flex-col items-center gap-7 whitespace-nowrap text-center">
        <div aria-hidden="true" className="configuration-loader" />
        <p className="font-syne text-[18px] font-normal leading-normal tracking-[-0.54px] text-[#191919]">
          {message}
        </p>
      </div>
    </main>
  );
}
