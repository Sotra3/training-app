import { useState } from "react";
import { Dumbbell } from "lucide-react";
import Field from "./Field";
import { supabase } from "./lib/supabaseClient";

export default function Login() {
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const login = emailOrUsername.trim().toLowerCase();
    if (!login || !password) { setError("Unesi email i lozinku."); return; }
    const isEmail = login.includes("@");
    if (!isEmail && !/^[a-z0-9._-]{3,30}$/i.test(login)) {
      setError("Unesi ispravan email ili staro korisničko ime.");
      return;
    }
    setLoading(true);
    const email = isEmail ? login : `${login}@trening.local`;
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) setError("Pogrešno korisničko ime ili lozinka.");
  }

  return (
    <main className="auth-screen min-h-screen text-neutral-900 flex items-center justify-center px-5 py-10">
      <div className="auth-card w-full max-w-md">
        <section className="p-7 sm:p-10">
          <div className="w-full max-w-sm mx-auto">
            <div className="auth-brand mb-8">
              <span className="auth-brand-icon"><Dumbbell size={20} /></span>
            </div>
            <p className="auth-eyebrow">Dobro došao/la</p>
            <h2 className="auth-title mb-7">Prijava</h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <Field label="Email">
                <input
                  className="w-full mt-2 px-3 py-3 border border-neutral-300 rounded-md focus:border-[#24352d] focus:ring-1 focus:ring-[#24352d] outline-none text-sm transition-colors"
                  type="text"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  maxLength={254}
                  autoCapitalize="none"
                  autoComplete="email"
                  autoFocus
                />
                <span className="mt-1 block text-xs normal-case text-neutral-400">Stari nalozi mogu i dalje da koriste korisničko ime.</span>
              </Field>
              <Field label="Lozinka">
                <input
                  className="w-full mt-2 px-3 py-3 border border-neutral-300 rounded-md focus:border-[#24352d] focus:ring-1 focus:ring-[#24352d] outline-none text-sm transition-colors"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </Field>
              {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="auth-submit w-full mt-2 px-4 py-3 bg-[#24352d] text-white text-sm font-medium rounded-md hover:bg-[#35483e] disabled:opacity-60 transition-colors"
              >
                {loading ? "Prijavljivanje..." : "Prijavi se"}
              </button>
            </form>
            <p className="text-xs text-neutral-500 mt-6">Nalog dobijaš od svog trenera.</p>
          </div>
        </section>
      </div>
    </main>
  );
}