import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { Btn } from "./AppShared";
import ClientApp from "./ClientApp";
import InviteAcceptance from "./InviteAcceptance";
import Login from "./Login";
import TrainerApp from "./TrainerApp";

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  const [inviteFlow, setInviteFlow] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("type") === "invite"
  );

  async function loadProfile(userId) {
    const { data } = await supabase
      .from("profiles")
      .select("id, name, role")
      .eq("id", userId)
      .maybeSingle();
    return data;
  }

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s);
      if (s) setProfile(await loadProfile(s.user.id));
      setReady(true);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (s) setProfile(await loadProfile(s.user.id));
      else setProfile(null);
    });
    unsub = () => listener.subscription.unsubscribe();
    return () => unsub();
  }, []);

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-neutral-400 font-mono">Učitavanje...</div>;

  if (inviteFlow && !session) {
    return <div className="min-h-screen flex items-center justify-center p-6 text-center text-neutral-500">Proveravam pozivnicu...</div>;
  }

  if (inviteFlow && session) {
    return (
      <InviteAcceptance
        user={session.user}
        existingProfile={profile}
        onComplete={(nextProfile) => {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          setProfile(nextProfile);
          setInviteFlow(false);
        }}
      />
    );
  }

  if (!session) return <Login />;

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center p-6 font-mono">
        <p className="text-neutral-500">Nalog nije podešen. Obrati se treneru.</p>
        <Btn color="ghost" onClick={() => supabase.auth.signOut()}>Odjavi se</Btn>
      </div>
    );
  }

  if (profile.id !== session.user.id || !["admin", "client"].includes(profile.role)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center p-6 font-mono">
        <p role="alert" className="text-neutral-500">Nemaš dozvolu za pristup ovoj stranici.</p>
        <Btn color="ghost" onClick={() => supabase.auth.signOut()}>Odjavi se</Btn>
      </div>
    );
  }

  const me = { id: session.user.id, email: session.user.email, name: profile.name, role: profile.role };

  if (me.role === "admin") {
    return <TrainerApp me={me} onLogout={() => supabase.auth.signOut()} />;
  }
  return <ClientApp me={me} onLogout={() => supabase.auth.signOut()} />;
}

function Shell({ title, icon, tabs, active, setActive, onLogout, right }) {
  return (
    <div className="min-h-screen bg-[#F3F4F1] pb-20">
      <div className="bg-neutral-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2 font-black uppercase tracking-wide">
          {icon} {title}
        </div>
        <div className="flex items-center gap-3">
          {right}
          <button onClick={onLogout}><LogOut size={18} /></button>
        </div>
      </div>
      <div className="max-w-4xl mx-auto p-4">{tabs[active]}</div>
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-neutral-900 flex max-w-4xl mx-auto">
        {Object.keys(tabs).map((k) => null)}
      </div>
    </div>
  );
}

