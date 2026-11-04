import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePerson } from "@/lib/auth";
import { isHead } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { ImportFlow } from "./import-flow";

export const metadata = { title: "Import staff" };

export default async function ImportPage() {
  const me = await requirePerson();
  if (!isHead(me)) redirect("/");
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft aria-hidden className="size-4" /> People &amp; units
      </Link>
      <PageHeader title="Import staff from Excel" subtitle="Add or update many people at once. You'll see a preview before anything is saved." />
      <ImportFlow />
    </div>
  );
}
