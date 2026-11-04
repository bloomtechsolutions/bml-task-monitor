import { LoginForm } from "./login-form";

const ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new one below.",
  inactive: "Your account is inactive. Contact the Head of Retail Banking.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-700">Retail Banking</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Task Monitor</h1>
        <p className="mt-1 mb-6 text-sm text-slate-600">Sign in with your work email. No password needed.</p>
        {error && ERRORS[error] && (
          <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {ERRORS[error]}
          </p>
        )}
        <LoginForm />
      </div>
    </main>
  );
}
