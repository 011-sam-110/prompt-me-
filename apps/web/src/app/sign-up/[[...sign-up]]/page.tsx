import { SignUp } from "@clerk/nextjs";
import { DevSignIn } from "@/components/auth/dev-sign-in";
import { isClerkConfigured } from "@/lib/auth/config";

export default function SignUpPage() {
  if (!isClerkConfigured()) {
    return <DevSignIn />;
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <SignUp />
    </div>
  );
}
