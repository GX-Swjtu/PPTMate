import AuthGate from "@/components/Auth/AuthGate";
import { isAuthDisabled } from "@/utils/auth";
import { getServerAuthStatus } from "@/utils/serverAuth";
import { redirect } from "next/navigation";

const page = async () => {
    if (isAuthDisabled()) {
        redirect("/upload");
    }

    const status = await getServerAuthStatus();
    if (status.configured && status.authenticated) {
        redirect("/upload");
    }

    return <AuthGate />;
};

export default page;
