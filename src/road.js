// Trazado de la carretera (compartido por el mundo, el terreno y el juego)
export const cx = s => 20 * Math.sin(s * 0.012) + 10 * Math.sin(s * 0.03 + 1);
export const cdx = s => 20 * 0.012 * Math.cos(s * 0.012) + 10 * 0.03 * Math.cos(s * 0.03 + 1);
export const cddx = s => -20 * 0.012 * 0.012 * Math.sin(s * 0.012) - 10 * 0.03 * 0.03 * Math.sin(s * 0.03 + 1);
export function roadPos(s, l, o) {
  const d = cdx(s), n = Math.sqrt(d * d + 1);
  o.x = cx(s) + l / n; o.z = -s + l * d / n; return o;
}
