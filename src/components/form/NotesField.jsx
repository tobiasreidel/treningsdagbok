import { Field } from '../ui'

// A free-text notes box bound to form.notes. Shared by the final notes+photo
// step and the earlier wizard steps, so whatever you type shows up on every
// page that renders it - the note is one value carried across the whole form.
export default function NotesField({ form, update }) {
  return (
    <Field label="Notes" optional>
      <textarea
        rows={5}
        value={form.notes}
        placeholder="How did it go? Conditions, what you worked on…"
        onChange={(e) => update({ notes: e.target.value })}
      />
    </Field>
  )
}
