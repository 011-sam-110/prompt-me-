// The clip upload endpoint — ROADMAP.md M4 / ENGINEERING_SPEC.md §4. Thin
// by design: auth + request parsing only, all the actual validation and
// persistence logic lives in lib/clips/upload.ts (testable without an HTTP
// layer at all — see upload.test.ts), same split as the M3 verification
// flow (lib/verification/actions.ts is the thin layer, run-check.ts holds
// the logic).
//
// A real multipart upload (not a Server Action) so the server receives the
// actual bytes and can measure their duration itself — ENGINEERING_SPEC §4:
// "never trust client-reported duration" requires seeing the real file.
import { NextResponse } from "next/server";
import { ensureUserForClerkId } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { uploadClip } from "@/lib/clips/upload";

function stringField(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "a 'file' field with the clip is required" }, { status: 400 });
  }

  const tier = Number(form.get("tier"));
  if (!Number.isInteger(tier)) {
    return NextResponse.json({ error: "a numeric 'tier' field is required" }, { status: 400 });
  }

  const db = await getAppDb();
  const user = await ensureUserForClerkId(db, clerkId);

  const data = new Uint8Array(await file.arrayBuffer());
  const result = await uploadClip(db, {
    userId: user.id,
    tier,
    data,
    mimeType: file.type || "application/octet-stream",
    promptId: stringField(form, "promptId"),
    customPromptText: stringField(form, "customPromptText"),
  });

  if (!result.ok) {
    const status =
      result.error.code === "invalid_tier" || result.error.code === "invalid_prompt_selection" ? 400 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ clip: result.clip }, { status: 201 });
}
