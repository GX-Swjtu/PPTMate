import { requireAdminSession } from "@/utils/serverAuth";
import AdminPanel from "./AdminPanel";

export const metadata = {
  title: "管理 | PPTMate",
};

export default async function AdminPage() {
  await requireAdminSession();
  return <AdminPanel />;
}
