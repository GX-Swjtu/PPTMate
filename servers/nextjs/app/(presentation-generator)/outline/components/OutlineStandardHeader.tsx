"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface OutlineStandardHeaderProps {
  title: string;
  onBack: () => void;
}

const OutlineStandardHeader = ({
  title,
  onBack,
}: OutlineStandardHeaderProps) => (
  <header className="sticky top-0 z-[60] h-[68px] w-full border-b border-[#EDEEEF] bg-white font-syne">
    <div className="flex h-full items-center justify-between px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/dashboard"
          aria-label="返回工作台"
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A5AF8]/30"
        >
          <Image
            src="/pptmate-mark.svg"
            alt=""
            width={32}
            height={33}
            className="h-[33px] w-[32px]"
          />
        </Link>
        <h1 className="truncate text-base font-medium tracking-[0.16px] text-[#101323]">
          {title}
        </h1>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="flex shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.96px] text-[#333333] transition-colors hover:text-[#7A5AF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A5AF8]/30"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        返回
      </button>
    </div>
  </header>
);

export default OutlineStandardHeader;
