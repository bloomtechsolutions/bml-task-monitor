"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md rounded-lg border border-red-200 bg-white p-6 text-center">
      <h1 className="font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-1 text-sm text-slate-600">The page couldn&apos;t load. Check your connection and try again.</p>
      <button onClick={reset} className="mt-4 inline-flex min-h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">
        Try again
      </button>
    </div>
  );
}
