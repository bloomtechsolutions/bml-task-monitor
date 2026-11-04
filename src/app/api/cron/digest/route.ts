import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Weekly email digest. Vercel Cron calls this on Sundays (see vercel.json) with the CRON_SECRET bearer token.
// In-app digests are created by the database itself; this only adds email, and only when Resend is configured.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM;
  if (!apiKey || !from) return NextResponse.json({ sent: 0, skipped: "email not configured" });

  const supabase = createClient();
  const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "digest_enabled").maybeSingle();
  if (setting?.value === false) return NextResponse.json({ sent: 0, skipped: "digest disabled" });

  const { data: rows, error } = await supabase.rpc("digest_rows");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const appUrl = process.env.APP_URL ?? `https://${req.headers.get("host")}`;

  let sent = 0;
  for (const r of rows ?? []) {
    if (!r.email || r.open_count + r.awaiting_count === 0) continue;
    const first = (r.full_name ?? "").split(" ")[0] || "there";
    const lines = [
      `${r.open_count} open task${r.open_count === 1 ? "" : "s"}`,
      r.overdue_count ? `${r.overdue_count} overdue` : null,
      r.due_week_count ? `${r.due_week_count} due this week` : null,
      r.awaiting_count ? `${r.awaiting_count} waiting for your sign-off` : null,
    ].filter(Boolean);
    const html = `<p>Good morning ${first},</p><p>Here's your week in Upnext:</p><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul><p><a href="${appUrl}">Open Upnext</a></p>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: r.email, subject: `Your tasks this week: ${lines.join(" · ")}`, html }),
    });
    if (res.ok) sent++;
  }
  return NextResponse.json({ sent });
}
