import { supabase } from "./supabaseClient";

const PHOTO_BUCKET = "progress-photos";
const PHOTO_FIELDS = "id, client_id, storage_path, taken_at, note, created_at";
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

async function withSignedUrl(photo) {
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(photo.storage_path, SIGNED_URL_TTL_SECONDS);

  if (error) {
    if (error.statusCode === "404" || error.message === "Object not found") {
      console.warn("Skipping progress photo with a missing storage object", photo.id, photo.storage_path);
      return null;
    }

    console.error("Could not create progress photo URL", photo.id, error);
    return false;
  }

  return { ...photo, img: data.signedUrl, date: photo.taken_at };
}

export async function getProgressPhotos(clientId) {
  const { data, error } = await supabase
    .from("progress_photos")
    .select(PHOTO_FIELDS)
    .eq("client_id", clientId)
    .order("taken_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getProgressPhotos error", clientId, error);
    return null;
  }

  const photos = await Promise.all(data.map(withSignedUrl));
  if (photos.some((photo) => photo === false)) return null;
  return photos.filter((photo) => photo !== null);
}

export async function addProgressPhoto(clientId, image, note, takenAt) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error("addProgressPhoto error: no authenticated user", authError);
    return null;
  }
  if (user.id !== clientId) {
    console.error("addProgressPhoto error: user cannot upload for another client", clientId);
    return null;
  }
  if (!(image instanceof Blob) || image.type !== "image/jpeg" || image.size > MAX_PHOTO_SIZE_BYTES) {
    console.error("addProgressPhoto error: invalid or oversized image", clientId);
    return null;
  }

  const id = crypto.randomUUID();
  const storagePath = `${clientId}/${id}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, image, { contentType: "image/jpeg", upsert: false });

  if (uploadError) {
    console.error("addProgressPhoto storage upload error", clientId, uploadError);
    return null;
  }

  const { data, error } = await supabase
    .from("progress_photos")
    .insert({
      id,
      client_id: clientId,
      storage_path: storagePath,
      taken_at: takenAt,
      note,
    })
    .select(PHOTO_FIELDS)
    .single();

  if (error) {
    console.error("addProgressPhoto metadata insert error", clientId, error);
    const { error: cleanupError } = await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
    if (cleanupError) {
      console.error("addProgressPhoto storage cleanup error", storagePath, cleanupError);
    }
    return null;
  }

  return withSignedUrl(data);
}

export async function deleteProgressPhoto(photo) {
  const { error: storageError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .remove([photo.storage_path]);

  if (storageError) {
    console.error("deleteProgressPhoto storage error", photo.id, storageError);
    return false;
  }

  const { data, error } = await supabase
    .from("progress_photos")
    .delete()
    .eq("id", photo.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("deleteProgressPhoto metadata error", photo.id, error);
    return false;
  }

  return true;
}
