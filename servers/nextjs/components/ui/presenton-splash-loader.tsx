"use client";

import { useLayoutEffect, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface PresentonSplashLoaderProps {
  message?: string;
  className?: string;
}

export const PRESENTON_SPLASH_MIN_DURATION_MS = 3000;

const SPLASH_ANIMATION_MS = 2600;
let splashSessionStartedAt: number | null = null;

function markSplashSessionStart(): number {
  if (splashSessionStartedAt === null) {
    splashSessionStartedAt = Date.now();
  }
  return splashSessionStartedAt;
}

function getSplashAnimationDelayMs(): number {
  const elapsed = Date.now() - markSplashSessionStart();
  return -Math.min(elapsed, SPLASH_ANIMATION_MS);
}

export function PresentonSplashLoader({
  message = "正在准备工作区",
  className,
}: PresentonSplashLoaderProps) {
  const [animationDelayMs, setAnimationDelayMs] = useState(0);

  useLayoutEffect(() => {
    setAnimationDelayMs(getSplashAnimationDelayMs());
  }, []);

  const containerStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 2147483000,
    display: "flex",
    minHeight: "100vh",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    background: "#ffffff",
  };

  const surfaceStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "142vmax",
    height: "142vmax",
    borderRadius: "50%",
    background: "#7a5af8",
    transform: "translate3d(-50%, -50%, 0) scale(0.001)",
    animation: `presenton-splash-surface-grow ${SPLASH_ANIMATION_MS}ms linear ${animationDelayMs}ms both`,
    willChange: "transform",
    backfaceVisibility: "hidden",
  };

  const wordmarkStyle: CSSProperties = {
    position: "relative",
    zIndex: 1,
    transform: "translateZ(0)",
    animation: `presenton-splash-text-reveal ${SPLASH_ANIMATION_MS}ms linear ${animationDelayMs}ms both`,
    willChange: "clip-path",
  };

  return (
    <main
      aria-busy="true"
      aria-label={message}
      className={cn("presenton-splash-loader", className)}
      role="status"
      style={containerStyle}
    >
      <div
        className="presenton-splash-surface"
        aria-hidden="true"
        style={surfaceStyle}
      />
      <div
        className="presenton-splash-wordmark presenton-splash-wordmark-reveal flex items-center gap-4 px-6 text-white sm:gap-5"
        aria-hidden="true"
        style={wordmarkStyle}
      >
        <img
          src="/pptmate-mark-reverse.svg"
          alt=""
          className="h-16 w-16 shrink-0 sm:h-20 sm:w-20"
        />
        <div className="min-w-0">
          <p className="font-unbounded text-2xl font-semibold tracking-[-0.04em] sm:text-4xl">
            PPTMate
          </p>
          <p className="mt-1 whitespace-nowrap font-syne text-sm tracking-[0.08em] text-white/85 sm:text-lg">
            智能演示生产平台
          </p>
        </div>
      </div>
    </main>
  );
}
