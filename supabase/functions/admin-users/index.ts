import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Niet ingelogd." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller identity with their JWT
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ ok: false, error: "Ongeldig sessie-token." }, 401);

    // Check caller role via service client (bypasses RLS for read)
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (!profile || profile.role !== "salesmanager") {
      return json({ ok: false, error: "Geen toegang. Alleen beheerders mogen gebruikers beheren." }, 403);
    }

    const body = await req.json();
    const { action } = body;

    // ── CREATE ─────────────────────────────────────────────
    if (action === "create") {
      const { email, naam, role, showroom, wachtwoord } = body;
      if (!email || !naam) return json({ ok: false, error: "E-mail en naam zijn verplicht." });

      const { data, error } = await adminClient.auth.admin.createUser({
        email:         email.trim().toLowerCase(),
        password:      wachtwoord || "Franssen2026!",
        email_confirm: true,
      });
      if (error) return json({ ok: false, error: error.message });

      const GELDIGE_ROLLEN = ["verkoper", "toonzaalverantwoordelijke", "salesmanager"];
      const nieuw = {
        id:        data.user.id,
        email:     email.trim().toLowerCase(),
        naam:      naam.trim(),
        role:      GELDIGE_ROLLEN.includes(role) ? role : "verkoper",
        showroom:  showroom || "Geel",
        aangemaakt: new Date().toISOString(),
      };
      const { error: profErr } = await adminClient.from("profiles").upsert(nieuw);
      if (profErr) return json({ ok: false, error: profErr.message });

      return json({ ok: true, user: nieuw });
    }

    // ── DELETE ─────────────────────────────────────────────
    if (action === "delete") {
      const { id } = body;
      if (!id) return json({ ok: false, error: "Gebruiker-id ontbreekt." });
      if (id === caller.id) return json({ ok: false, error: "Je kunt je eigen account niet verwijderen." });

      await adminClient.from("profiles").delete().eq("id", id);
      const { error } = await adminClient.auth.admin.deleteUser(id);
      if (error) return json({ ok: false, error: error.message });

      return json({ ok: true });
    }

    // ── SET PASSWORD ───────────────────────────────────────
    if (action === "setPassword") {
      const { id, wachtwoord } = body;
      if (!id || !wachtwoord) return json({ ok: false, error: "Id en wachtwoord zijn verplicht." });

      const { error } = await adminClient.auth.admin.updateUserById(id, { password: wachtwoord });
      if (error) return json({ ok: false, error: error.message });

      return json({ ok: true });
    }

    return json({ ok: false, error: `Onbekende actie: ${action}` }, 400);

  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
