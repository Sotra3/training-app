import { supabase } from "./supabaseClient";


export async function storeGet(key) {
  const { data, error } = await supabase
    .from("kv_store")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    console.error("storeGet error", key, error);
    return null;
  }
  return data ? data.value : null;
}

export async function storeSet(key, value) {
  const { error } = await supabase
    .from("kv_store")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) {
    console.error("storeSet error", key, error);
    return false;
  }
  return true;
}
