"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputCls, labelCls } from "@/components/ui";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState("error");
      setError(
        error.status === 429
          ? "Too many sign-in emails were sent. Please wait a few minutes and try again."
          : error.message,
      );
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-medium">Check your inbox</p>
        <p className="mt-1">
          We sent a sign-in link to <strong>{email}</strong>. Open it on this device to continue.
        </p>
        <button type="button" onClick={() => setState("idle")} className="mt-3 text-sm font-medium underline">
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className={labelCls}>
          Work email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
          placeholder="name@bml.com.mv"
          aria-invalid={state === "error"}
          aria-describedby={state === "error" ? "email-error" : undefined}
        />
        {state === "error" && (
          <p id="email-error" className="mt-1.5 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={state === "sending" || !email.includes("@")}
        className="flex min-h-11 w-full items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {state === "sending" ? "Sending link…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
