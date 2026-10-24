export const metadata = { title: "Temporarily unavailable" };

export default function Maintenance() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold">Store temporarily unavailable</h1>
      <p className="mt-2 text-sm text-ink-soft">
        We're carrying out maintenance and will be back shortly. Existing orders and
        payments are safe. Please check back soon.
      </p>
    </main>
  );
}
