// Round profile avatar: uploaded photo → chosen emoji → initials.
// `size` sets the pixel box; font sizes scale off it.

// Stable hue from the name so your initials keep their colour.
function hueOf(str) {
  let h = 0
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) % 360
  return h
}

export default function Avatar({ url, emoji, name, size = 40 }) {
  const box = { width: size, height: size }
  if (url) {
    return <img className="avatar" src={url} style={box} alt="" />
  }
  if (emoji) {
    return (
      <span className="avatar avatar-emoji" style={{ ...box, fontSize: size * 0.55 }}>
        {emoji}
      </span>
    )
  }
  const src = (name || '').trim()
  const initials = src
    ? src
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join('')
    : '?'
  return (
    <span
      className="avatar avatar-initials"
      style={{ ...box, fontSize: size * 0.42, background: `hsl(${hueOf(src || '?')} 55% 45%)` }}
    >
      {initials}
    </span>
  )
}
