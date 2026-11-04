import { NextResponse } from "next/server";
import { getPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canViewTask } from "@/lib/permissions";

const UUID = /^[0-9a-f-]{36}$/i;

/** Opens an evidence file through a 60-second signed link, after checking the viewer may see the task. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const me = await getPerson();
  if (!me) return new NextResponse("Sign in first.", { status: 401 });
  if (!UUID.test(id) || !UUID.test(fileId)) return new NextResponse("Not found", { status: 404 });

  const supabase = createClient();
  const [{ data: task }, { data: file }] = await Promise.all([
    supabase.from("tasks").select("unit_id, assignee_id, assigned_by").eq("id", id).maybeSingle(),
    supabase.from("task_attachments").select("storage_path, file_name").eq("id", fileId).eq("task_id", id).maybeSingle(),
  ]);
  if (!task || !file || !canViewTask(me, task)) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await supabase.storage.from("task-evidence").createSignedUrl(file.storage_path, 60, { download: file.file_name });
  if (error || !data) return new NextResponse("Couldn't open the file.", { status: 502 });
  return NextResponse.redirect(data.signedUrl);
}
