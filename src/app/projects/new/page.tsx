import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CreateProjectForm } from "@/components/projects/create-project-form";

export default async function NewProjectPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          New project
        </h1>
        <p className="text-muted-foreground text-sm">
          You&apos;ll be the project&apos;s creator and leader. You can invite
          CUET classmates once it&apos;s created.
        </p>
      </div>
      <CreateProjectForm />
    </main>
  );
}
