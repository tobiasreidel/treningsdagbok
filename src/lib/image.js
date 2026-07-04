// Client-side photo downscaling. Phone photos are 5–10 MB; a ~1600px JPEG is
// plenty for a training-diary photo, uploads far faster on mobile data, and
// stretches the free storage tier. Any failure (odd format, old browser)
// falls back to the original file - uploading big beats not uploading.
export async function compressImage(file, maxDim = 1600, quality = 0.85) {
  try {
    if (!file?.type?.startsWith('image/')) return file

    // Decode via <img> (not createImageBitmap) so EXIF orientation is applied.
    // The object URL must stay alive until drawImage below has run.
    const url = URL.createObjectURL(file)
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    }).catch((err) => {
      URL.revokeObjectURL(url)
      throw err
    })

    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    // Already small enough - skip the re-encode.
    if (scale === 1 && file.size < 500 * 1024) {
      URL.revokeObjectURL(url)
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    // Only use the re-encode when it actually helped.
    if (!blob || blob.size >= file.size) return file

    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
