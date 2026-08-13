import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Providers } from "./providers";
import MixpanelInitializer from "./MixpanelInitializer";
import { Toaster } from "@/components/ui/sonner";
import TailwindBrowserRuntime from "@/components/runtime/TailwindBrowserRuntime";
const inter = localFont({
  src: [
    {
      path: "./fonts/Inter.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  preload: false,
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PPTMATE_PUBLIC_URL || "https://pptmate.ngl.local"),
  title: "PPTMate｜智能演示生产平台",
  description: "上传资料，通过 AI 快速生成、修改和完善演示文稿。",
  keywords: [
    "AI presentation generator",
    "data storytelling",
    "data visualization tool",
    "AI data presentation",
    "presentation generator",
    "data to presentation",
    "interactive presentations",
    "professional slides",
  ],
  openGraph: {
    title: "PPTMate｜智能演示生产平台",
    description: "上传资料，通过 AI 快速生成、修改和完善演示文稿。",
    url: "/",
    siteName: "PPTMate",
    type: "website",
    locale: "zh_CN",
  },
  alternates: {
    canonical: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "PPTMate｜智能演示生产平台",
    description: "上传资料，通过 AI 快速生成、修改和完善演示文稿。",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${inter.variable} antialiased`}>
        <Providers>
          <MixpanelInitializer>{children}</MixpanelInitializer>
        </Providers>
        <TailwindBrowserRuntime />
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
