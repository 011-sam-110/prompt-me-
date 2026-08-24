import { SignIn } from "@clerk/nextjs";
import { DevSignIn } from "@/components/auth/dev-sign-in";
import { isClerkConfigured } from "@/lib/auth/config";

export default function SignInPage() {
  if (!isClerkConfigured()) {
    return <DevSignIn />;
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <SignIn />
    </div>
  );
}
