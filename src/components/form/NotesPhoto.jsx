import { useEffect, useState } from 'react'
import { Field } from '../ui'
import { compressImage } from '../../lib/image'
import NotesField from './NotesField'

// Final step: free-text notes + an optional photo.
// `existingPhotoSrc` is a resolved (signed) URL for a previously saved photo.
export default function NotesPhoto({ form, update, existingPhotoSrc }) {
  const [preview, setPreview] = useState(null)

  // Preview a freshly chosen file.
  useEffect(() => {
    if (!form.photoFile) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(form.photoFile)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [form.photoFile])

  const showExisting = !form.photoFile && !form.removePhoto && existingPhotoSrc

  const onPick = async (e) => {
    const file = e.target.files?.[0] || null
    // Downscale before it enters the form, so both the direct upload and the
    // offline outbox store the small version.
    update({ photoFile: file ? await compressImage(file) : null, removePhoto: false })
  }

  const clearNew = () => update({ photoFile: null })
  const removeExisting = () => update({ removePhoto: true, photoFile: null })

  return (
    <div className="stack">
      <NotesField form={form} update={update} />

      <Field label="Photo" optional>
        {preview ? (
          <div className="photo-preview">
            <img src={preview} alt="Selected" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearNew}>
              Remove
            </button>
          </div>
        ) : showExisting ? (
          <div className="photo-preview">
            <img src={existingPhotoSrc} alt="Session" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={removeExisting}>
              Remove
            </button>
          </div>
        ) : (
          <label className="photo-drop">
            <input type="file" accept="image/*" onChange={onPick} hidden />
            <span>📷 Add a photo</span>
          </label>
        )}
      </Field>
    </div>
  )
}
