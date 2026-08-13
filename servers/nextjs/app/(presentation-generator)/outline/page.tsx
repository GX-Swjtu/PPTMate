import React from "react";
import { Metadata } from "next";
import OutlinePage from "./components/OutlinePage";

export const metadata: Metadata = {
  title: "演示大纲 | PPTMate",
  description: "上传资料，通过 AI 快速生成、修改和完善演示文稿。",
  alternates: {
    canonical: "/outline"
  },
  keywords: [
    "presentation generator",
    "AI presentations",
    "data visualization",
    "automatic presentation maker",
    "professional slides",
    "data-driven presentations",
    "document to presentation",
    "presentation automation",
    "smart presentation tool",
    "business presentations"
  ]
};

const page = () => {
  return (
    <div className="relative min-h-screen" translate="no">
      <OutlinePage />
    </div>
  );
};

export default page;
