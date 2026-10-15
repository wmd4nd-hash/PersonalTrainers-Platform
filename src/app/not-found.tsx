import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-subtle">It may have moved, or it was never published.</p>
      <Link href="/" className="mt-6 inline-block font-medium text-brand">
        Go home
      </Link>
    </div>
  );
}
