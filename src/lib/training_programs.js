import { supabase } from "./supabaseClient";

export async function getTrainingProgram(clientId, weekStart) {
  const { data, error } = await supabase
    .from("training_programs")
    .select("program")
    .eq("client_id", clientId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) {
    console.error("getTrainingProgram error", clientId, weekStart, error);
    return null;
  }
  return data?.program ?? null;
}

export async function getTrainingPrograms(clientId) {
  const { data, error } = await supabase
    .from("training_programs")
    .select("week_start, program")
    .eq("client_id", clientId)
    .order("week_start", { ascending: true });

  if (error) {
    console.error("getTrainingPrograms error", clientId, error);
    return null;
  }

  return (data || []).map(({ week_start, program }) => ({
    ...program,
    weekId: program.weekId || week_start,
  }));
}


export async function saveTrainingProgram(clientId, weekStart, program) {
  const { data, error } = await supabase
    .from("training_programs")
    .upsert(
      {
        client_id: clientId,
        week_start: weekStart,
        program,
      },
      { onConflict: "client_id,week_start" }
    )
    .select("program")
    .single();

  if (error) {
    console.error("saveTrainingProgram error", clientId, weekStart, error);
    return null;
  }

  return data.program;
}
