import { supabase } from "./supabaseClient";

export async function getWorkoutReport(reportId) {
  const { data, error } = await supabase
    .from("workout_reports")
    .select("id, client_id, week_start, day_index, day_name, workout_date, submitted_at, exercises")    
    .eq("id", reportId)
    .maybeSingle();
  if (error) {
    console.error("getWorkoutReport error", reportId, error);
    return null;
  }
  return data;
}

export async function getWorkoutReports(clientId) {
  const { data, error } = await supabase
    .from("workout_reports")
    .select("id, client_id, week_start, day_index, day_name, workout_date, submitted_at, exercises")
    .eq("client_id", clientId)
    .order("workout_date", { ascending: false });
  if (error) {
    console.error("getWorkoutReports error", clientId, error);
    return null;
  }
  return data;
}

export async function submitWorkoutReport(clientId, weekStart, dayIndex, dayName, workoutDate, exercises) {
  const { data, error } = await supabase
    .from("workout_reports")
    .upsert(
      {
        client_id: clientId,
        week_start: weekStart,
        day_index: dayIndex,
        day_name: dayName,
        workout_date: workoutDate,
        exercises,
      },
      { onConflict: "client_id,week_start,day_index,workout_date" }
    )
    .select("*")
    .single();

  if (error) {
    console.error("submitWorkoutReport error", clientId, weekStart, error);
    return null;
  }

  return data;
}

export async function deleteWorkoutReport(reportId) {
  const { data, error } = await supabase
    .from("workout_reports")
    .delete()
    .eq("id", reportId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("deleteWorkoutReport error", reportId, error);
    return null;
  }

  return Boolean(data);
}
