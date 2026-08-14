"use client";

import React from "react";
import { LayoutDashboard, Star, Brain, Settings, HelpCircle, UsersRound } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";



export const defaultNavItems = [
    { key: "dashboard" as const, label: "工作台", icon: LayoutDashboard },
    { key: "templates" as const, label: "标准模式", icon: Star },
    { key: "designs" as const, label: "智能模式", icon: Brain },
    { key: "community" as const, label: "社区", icon: UsersRound },



];
export const BelongingNavItems = [
    { key: "settings" as const, label: "设置", icon: Settings },
]

const DashboardSidebar = () => {
    const pathname = usePathname();
    const platformMode = process.env.NEXT_PUBLIC_PLATFORM_MODE === "true";

    return (
        <aside
            className="sticky top-0 flex h-screen w-[114px] shrink-0 flex-col justify-between border-r border-[#E1E1E5] bg-[#F6F6F9] px-4 py-8 backdrop-blur"
            aria-label="工作台侧边栏"
        >
            <div>

                <Link href={`/dashboard`} className="flex items-center justify-center border-b border-[#E1E1E5] pb-6">
                    <img src="/pptmate-mark.svg" alt="PPTMate" className="h-12 w-12 object-contain" />
                </Link>
                <nav className="pt-6 font-syne" aria-label="工作台导航">
                    <div className="  space-y-6">

                        {/* Dashboard */}
                        <Link
                            prefetch={false}
                            href={`/dashboard`}
                            className={[
                                "flex flex-col tex-center items-center gap-2  transition-colors",
                                pathname === "/dashboard" ? "" : "ring-transparent",
                            ].join(" ")}
                            aria-label="工作台"
                            title="工作台"
                        >
                            <LayoutDashboard className={["h-4 w-4", pathname === "/dashboard" ? "text-[#5146E5]" : "text-slate-600"].join(" ")} />
                            <span className="text-[11px] text-slate-800">工作台</span>
                        </Link>
                        <Link
                            prefetch={false}
                            href={`/templates`}
                            className={[
                                "flex flex-col tex-center items-center gap-2  transition-colors",
                                pathname === "/templates" ? "" : "ring-transparent",
                            ].join(" ")}
                            aria-label="模板"
                            title="模板"
                        >
                            <div className="flex flex-col cursor-pointer tex-center items-center gap-2  transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={`${pathname === "/templates" ? "#5146E5" : "#475569"}`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M4 14h6" /><path d="M4 2h10" /><rect x="4" y="18" width="16" height="4" rx="1" /><rect x="4" y="6" width="16" height="4" rx="1" /></svg>
                                <span className="text-[11px] text-slate-800">模板</span>
                            </div>
                        </Link>
                        {!platformMode && <Link
                            prefetch={false}
                            href="/community"
                            className="flex flex-col items-center gap-2 text-center transition-colors"
                            aria-label="Community"
                            title="Community"
                        >
                            <UsersRound className={`h-4 w-4 ${pathname === "/community" ? "text-[#5146E5]" : "text-slate-600"}`} />
                            <span className="text-[11px] text-slate-800">Community</span>
                        </Link>}
                        {/* <Link
                            prefetch={false}
                            href={`/theme`}
                            className={[
                                "flex flex-col tex-center items-center gap-2  transition-colors",
                                pathname === "/theme" ? "" : "ring-transparent",
                            ].join(" ")}
                            aria-label="Theme"
                            title="Theme"
                        >
                            <div className="flex flex-col cursor-pointer tex-center items-center gap-2  transition-colors">
                                <Palette className={`h-4 w-4 ${pathname === "/theme" ? "text-[#5146E5]" : "text-slate-600"}`} />
                                <span className="text-[11px] text-slate-800">Themes</span>
                            </div>
                        </Link> */}
                    </div>
                </nav>
            </div>

            {!platformMode && <div className="border-t border-[#E1E1E5] pt-5 font-syne">
                <Link
                    href="https://docs.presenton.ai/help"
                    target="_blank"
                    className="flex flex-col items-center gap-2 transition-colors"
                >
                    <HelpCircle className="h-4 w-4" />
                    <span className="text-[11px] text-slate-800">Help</span>
                </Link>
            </div>}

        </aside>
    );
};

export default DashboardSidebar;
