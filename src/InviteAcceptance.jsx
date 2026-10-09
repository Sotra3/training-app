import { useState } from "react";
import { Dumbbell } from "lucide-react";
import Field from "./Field";
import { supabase } from "./lib/supabaseClient";

export default function InviteAcceptance({ user, existingProfile, onComplete }) {
  const [name, setName] = useState(existingProfile?.name || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (existingProfile && existingProfile.role !== "client") {
      setError("Ovaj nalog nije podešen kao klijentski. Obrati se treneru.");
      return;
    }
    if (password.length < 8) {
      setError("Lozinka mora imati najmanje 8 znakova.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Lozinke se ne poklapaju.");
      return;
    }
    if (!existingProfile && !name.trim()) {
      setError("Unesi ime koje će trener videti.");
      return;
    }
    setSaving(true);
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;

      const { data: currentProfile, error: lookupError } = await supabase
        .from("profiles")
        .select("id, name, role")
        .eq("id", user.id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      let profile = currentProfile || existingProfile;
      if (!profile) {
        const { data: insertedProfile, error: profileError } = await supabase
          .from("profiles")
          .insert({ id: user.id, role: "client", name: name.trim() })
          .select("id, name, role")
          .single();
        if (profileError) throw profileError;
        profile = insertedProfile;
      } else if (profile.role !== "client") {
        throw new Error("Ovaj nalog nije podešen kao klijentski. Obrati se treneru.");
      }

      onComplete(profile);
    } catch (submitError) {
      console.error("Invitation acceptance failed", submitError);
      setError(submitError.message || "Nije moguće završiti aktivaciju naloga.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="auth-screen min-h-screen px-5 py-10 text-neutral-900">
      <div className="auth-card mx-auto mt-4 w-full max-w-md p-6 sm:p-9">
        <div className="auth-brand mb-8">
          <span className="auth-brand-icon"><Dumbbell size={20} /></span>
        </div>
        <p className="auth-eyebrow mb-2">Aktivacija naloga</p>
        <h1 className="auth-title">Postavi svoju lozinku</h1>
        <p className="mt-2 text-sm text-neutral-500">Nalog se aktivira za {user.email}.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {!existingProfile && (
            <Field label="Ime i prezime">
              <input
                className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-3 text-sm outline-none focus:border-[#24352d] focus:ring-1 focus:ring-[#24352d]"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </Field>
          )}
          <Field label="Nova lozinka">
            <input
              className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-3 text-sm outline-none focus:border-[#24352d] focus:ring-1 focus:ring-[#24352d]"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Field label="Ponovi lozinku">
            <input
              className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-3 text-sm outline-none focus:border-[#24352d] focus:ring-1 focus:ring-[#24352d]"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="auth-submit w-full rounded-xl bg-[#24352d] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#35483e] disabled:opacity-60"
          >
            {saving ? "Aktiviram nalog..." : "Aktiviraj nalog"}
          </button>
        </form>
      </div>
    </main>
  );
}
