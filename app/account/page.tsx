import { requireMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NameForm, PasswordForm, PinForm } from "@/components/AccountForms";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { user, profile } = await requireMember();
  const { data: login } = await createAdminClient().from("pin_logins").select("name_key").eq("user_id", user.id).maybeSingle();
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
  const hasPassword = providers.includes("email");
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <NameForm name={profile.display_name} usesPin={!!login} />
      {login ? <PinForm /> : <PasswordForm hasPassword={hasPassword} />}
      {!login && user.email && <p className="text-center text-xs text-slate-500">Signed in as {user.email}</p>}
    </div>
  );
}
