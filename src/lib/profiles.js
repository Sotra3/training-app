import { supabase } from "./supabaseClient";

export async function getClientNutrition(clientId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("nutrition_plan")
    .eq("id", clientId)
    .single();
  if (error) {
    console.error("getClientNutrition error", clientId, error);
    return null;
  }
  return data?.nutrition_plan ?? null;
}

export async function getClientMembership(clientId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("membership")
    .eq("id", clientId)
    .single();
  if (error) {
    console.error("getClientMembership error", clientId, error);
    return null;
  }
  return data?.membership ?? null;
}

export async function updateClientNutritionPlan(clientId, nutritionPlan) {
  const { error } = await supabase
    .from("profiles")
    .update({ nutrition_plan: nutritionPlan })
    .eq("id", clientId);
  if (error) {
    console.error("updateClientNutritionPlan error", clientId, error);
    return false;
  }
  return true;
}


export async function updateClientMembership(clientId, membershipDate) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ membership: membershipDate || null })
    .eq("id", clientId);
  if (error) {
    console.error("updateClientMembership error", clientId, error);
    return null;
  }
  return data ? data : null;
}