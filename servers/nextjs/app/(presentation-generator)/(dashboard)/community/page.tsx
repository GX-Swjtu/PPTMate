import type { Metadata } from "next";

import CommunityPage from "./components/CommunityPage";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "社区 | PPTMate",
  description: "Explore community presentation designs and prompts.",
};

export default function Page() {
  if (process.env.PLATFORM_MODE === "true") {
    notFound();
  }
  return <CommunityPage />;
}
