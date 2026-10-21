import { Card, PageHeader } from "./ui";

/** Placeholder for a page another feature will build. */
export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card className="text-sm text-subtle">This page is coming soon.</Card>
    </>
  );
}
