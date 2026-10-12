import { supabase } from "./supabaseClient";

async function getAuthenticatedUserId(operation) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    console.error(`${operation} error: no authenticated user`, error);
    return null;
  }
  return data.user.id;
}

export async function getNotifications() {
  const recipientId = await getAuthenticatedUserId("getNotifications");
  if (!recipientId) return null;

  const { data, error } = await supabase
    .from("notifications")
    .select("id, recipient_id, sender_id, workout_report_id, message, created_at")
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getNotifications error", recipientId, error);
    return null;
  }
  return data;
}

export async function createNotification(recipientId, workoutReportId, message) {
  const senderId = await getAuthenticatedUserId("createNotification");
  if (!senderId) {
    return { ok: false, error: { message: "Nema prijavljenog korisnika." } };
  }

  const { error } = await supabase
    .from("notifications")
    .insert({
      recipient_id: recipientId,
      sender_id: senderId,
      workout_report_id: workoutReportId,
      message,
    });

  if (error) {
    console.error("createNotification error", recipientId, error);
    return { ok: false, error };
  }
  return { ok: true, error: null };
}

export async function deleteNotification(notificationId) {
  const recipientId = await getAuthenticatedUserId("deleteNotification");
  if (!recipientId) return null;

  const { data, error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("recipient_id", recipientId)
    .select("id");

  if (error) {
    console.error("deleteNotification error", notificationId, error);
    return null;
  }
  return data;
}

export async function deleteNotifications(notificationIds) {
  const recipientId = await getAuthenticatedUserId("deleteNotifications");
  if (!recipientId) return null;

  if (notificationIds && notificationIds.length === 0) return [];

  const { data, error } = await supabase
    .from("notifications")
    .delete()
    .eq("recipient_id", recipientId)
    .in("id", notificationIds || [])
    .select("id");

  if (error) {
    console.error("deleteNotifications error", recipientId, error);
    return null;
  }
  return data;
}
