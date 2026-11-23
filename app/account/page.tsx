import { requireMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NameForm, PasswordForm, PayoutInfoForm, PinForm } from "@/components/AccountForms";
import PushToggle from "@/components/PushToggle";
import { pushReady } from "@/lib/push";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { supabase, user, profile } = await requireMember();
  const { data: payout } = await supabase.from("payout_info").select("venmo_handle, cashapp_tag").eq("user_id", user.id).maybeSingle();
  const { data: login } = await createAdminClient().from("pin_logins").select("name_key").eq("user_id", user.id).maybeSingle();
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
  const hasPassword = providers.includes("email");
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <NameForm name={profile.display_name} usesPin={!!login} />
      <div className="card space-y-2">
        <h2 className="text-lg font-bold">Notifications</h2>
        <p className="text-sm text-slate-400">Get a notification when a new week&apos;s pick em is posted.</p>
        <PushToggle ready={await pushReady()} forAdmin={profile.is_admin} />
      </div>
      <PayoutInfoForm venmo={payout?.venmo_handle ? "@" + payout.venmo_handle : ""} cashapp={payout?.cashapp_tag ? "$" + payout.cashapp_tag : ""} />
      {login ? <PinForm /> : <PasswordForm hasPassword={hasPassword} />}
      {!login && user.email && <p className="text-center text-xs text-slate-500">Signed in as {user.email}</p>}
    </div>
  );
}
