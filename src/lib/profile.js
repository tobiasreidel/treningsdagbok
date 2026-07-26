// Profile picture handling. The avatar lives in the same private storage
// bucket as session photos, at a deterministic path (<uid>/avatar.jpg) - so
// "does the file exist" is the source of truth and no DB migration is needed.
// Only you can see your own avatar (the bucket is owner-scoped by RLS).
import { supabase, PHOTO_BUCKET, currentUserId } from './supabase'
import { compressImage } from './image'

const avatarPath = (id) => `${id}/avatar.jpg`

// Signed URL for the current user's avatar, or null when none is uploaded.
export async function getAvatarUrl() {
  const id = await currentUserId()
  if (!id) return null
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(avatarPath(id), 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

// Upload (or replace) the avatar. Downscaled hard - it only ever renders small.
export async function uploadAvatar(file) {
  const id = await currentUserId()
  if (!id) throw new Error('Not signed in')
  const small = await compressImage(file, 512, 0.85)
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(avatarPath(id), small, {
      contentType: small.type || 'image/jpeg',
      upsert: true,
    })
  if (error) throw error
}

export async function removeAvatar() {
  const id = await currentUserId()
  if (!id) return
  await supabase.storage.from(PHOTO_BUCKET).remove([avatarPath(id)])
}
