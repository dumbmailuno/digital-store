import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-sm text-ink-mute">404</p>
      <h1 className="page-title mt-2">Page not found</h1>
      <p className="mt-2 text-sm text-ink-soft">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Link href="/" className="btn mt-6">Back to the store</Link>
    </main>
  );
}
