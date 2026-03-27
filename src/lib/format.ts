export function fmt(v: number, short = false): string {
  if (short && v >= 1000) return `R$${(v / 1000).toFixed(1)}k`
  return `R$ ${(v || 0)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function setText(id: string, v: string): void {
  const e = document.getElementById(id)
  if (e) e.textContent = v
}
