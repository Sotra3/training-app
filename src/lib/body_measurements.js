import { supabase } from "./supabaseClient";

export async function getBodyMeasurements(clientId) {
  const { data, error } = await supabase
    .from("body_measurements")
    .select("id, client_id, measured_at, weight, note, created_at")
    .eq("client_id", clientId)
    .order("measured_at", { ascending: false });

  if (error) {
    console.error("getBodyMeasurements error", clientId, error);
    return null;
  }

  return data;
}

export async function addBodyMeasurement(weight, note = "") {
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error("addBodyMeasurement error: no authenticated user", authError);
    return null;
  }

  const { data, error } = await supabase
    .from("body_measurements")
    .insert({
      client_id: user.id,
      weight,
      note,
    })
    .select("id, client_id, measured_at, weight, note, created_at")
    .single();

  if (error) {
    console.error("addBodyMeasurement error", user.id, error);
    return null;
  }

  return data;
}
