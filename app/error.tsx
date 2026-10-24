"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  // never render error.message: it can leak internals
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-sm text-ink-mute">500</p>
      <h1 className="mt-2 text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink-soft">An unexpected error occurred. Please try again.</p>
      <button onClick={reset} className="btn mt-6">Try again</button>
    </main>
  );
}
