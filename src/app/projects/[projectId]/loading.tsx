import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectLoading() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-16" />
      <Skeleton className="h-40" />
      <Skeleton className="h-48" />
      <span className="sr-only">Loading project…</span>
    </main>
  );
}
