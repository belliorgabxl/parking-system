/** PromptPay-style QR shown in the payment sheet. */
export function PaymentQr({ seed }: { seed: string }) {
  const n = 25;
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
  const finder = (x: number, y: number) =>
    [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
  const finderOn = (x: number, y: number) => {
    for (const [fx, fy] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ]) {
      const dx = x - fx;
      const dy = y - fy;
      if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) {
        const edge = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        return edge || core;
      }
    }
    return false;
  };
  const cells: [number, number][] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (finder(x, y) ? finderOn(x, y) : rand() > 0.52) cells.push([x, y]);
  return (
    <svg className="qr" viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label="Payment QR code">
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#18181b" />
      ))}
    </svg>
  );
}
