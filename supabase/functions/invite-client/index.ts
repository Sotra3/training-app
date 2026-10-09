import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { ok: false, error: "Method not allowed." });

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return respond(401, { ok: false, error: "Prijava je obavezna." });

  let requestBody: { email?: unknown };
  try {
    requestBody = await request.json();
  } catch {
    return respond(400, { ok: false, error: "Neispravan zahtev." });
  }

  const email = typeof requestBody.email === "string" ? requestBody.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond(400, { ok: false, error: "Unesi ispravnu email adresu." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appSiteUrl = Deno.env.get("APP_SITE_URL");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !appSiteUrl) {
    return respond(500, { ok: false, error: "Edge Function nije pravilno podešen." });
  }

  let redirectTo: string;
  try {
    redirectTo = new URL(appSiteUrl).toString();
  } catch {
    return respond(500, { ok: false, error: "APP_SITE_URL mora biti validna URL adresa." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) {
    return respond(401, { ok: false, error: "Sesija nije validna. Prijavi se ponovo." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Could not verify invitation sender role", profileError.message);
    return respond(500, { ok: false, error: "Nije moguće proveriti ulogu naloga." });
  }
  if (profile?.role !== "admin") {
    return respond(403, { ok: false, error: "Samo trener može da šalje pozivnice." });
  }

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });
  if (inviteError) {
    return respond(400, { ok: false, error: inviteError.message });
  }

  return respond(200, { ok: true });
});
