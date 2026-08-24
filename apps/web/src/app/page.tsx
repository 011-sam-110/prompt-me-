import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Prompt Me</h1>
        <p className="text-muted-foreground">
          No profiles, no photo grids. A voice-first date, or no match at
          all.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <Link href="/sign-up" className={buttonVariants({ className: "w-full" })}>
          Get started
        </Link>
        <Link
          href="/sign-in"
          className={buttonVariants({ variant: "outline", className: "w-full" })}
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
