import { redirect } from "next/navigation";

import SessionClient from "@/components/session-client";
import { hasBetaAccess } from "@/lib/access";

export default async function SessionPage() {
  const hasAccess =
    await hasBetaAccess();

  if (!hasAccess) {
    redirect("/");
  }

  return <SessionClient />;
}