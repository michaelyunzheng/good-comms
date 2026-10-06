import { redirect } from "next/navigation";

import SessionClient from "@/components/session-client";
import { shuffledQuestionIndices } from "@/lib/questions";
import { hasBetaAccess } from "@/lib/access";

export default async function SessionPage() {
  const hasAccess =
    await hasBetaAccess();

  if (!hasAccess) {
    redirect("/");
  }

  return <SessionClient initialQuestionOrder={shuffledQuestionIndices()} />;
}