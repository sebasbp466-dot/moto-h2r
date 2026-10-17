// Trazado de la carretera (compartido por el mundo, el terreno y el juego)
const A = s => 1 + 0.45 * Math.sin(s * 0.0021 + 0.7);
const dA = s => 0.45 * 0.0021 * Math.cos(s * 0.0021 + 0.7);
const ddA = s => -0.45 * 0.0021 * 0.0021 * Math.sin(s * 0.0021 + 0.7);
const K = 0.72;
export const cx = s => K * (A(s) * 20 * Math.sin(s * 0.012) + 10 * Math.sin(s * 0.03 + 1) + 4 * Math.sin(s * 0.047 + 2.1));
export const cdx = s => K * (dA(s) * 20 * Math.sin(s * 0.012) + A(s) * 20 * 0.012 * Math.cos(s * 0.012) + 10 * 0.03 * Math.cos(s * 0.03 + 1) + 4 * 0.047 * Math.cos(s * 0.047 + 2.1));
export const cddx = s => K * (ddA(s) * 20 * Math.sin(s * 0.012) + 2 * dA(s) * 20 * 0.012 * Math.cos(s * 0.012) - A(s) * 20 * 0.012 * 0.012 * Math.sin(s * 0.012) - 10 * 0.03 * 0.03 * Math.sin(s * 0.03 + 1) - 4 * 0.047 * 0.047 * Math.sin(s * 0.047 + 2.1));
export function roadPos(s, l, o) {
  const d = cdx(s), n = Math.sqrt(d * d + 1);
  o.x = cx(s) + l / n; o.z = -s + l * d / n; return o;
}
