"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body className="m-0 bg-[#F6F6F9] font-sans text-[#101323]">
        <main className="flex min-h-screen items-center justify-center p-6 text-center">
          <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
            <img src="/pptmate-mark.svg" alt="PPTMate" className="mx-auto h-16 w-16" />
            <h1 className="mt-5 text-2xl font-semibold">页面暂时无法显示</h1>
            <p className="mt-3 text-sm leading-6 text-[#667085]">
              PPTMate 遇到意外错误，请刷新页面后重试。
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-xl bg-[#7A5AF8] px-5 py-2.5 text-sm font-medium text-white"
            >
              刷新页面
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
