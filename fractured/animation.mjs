export function animationState(time, raw) {
  const duration = Math.max(.5, Number(raw.duration) || 1.25);
  const speed = Math.max(.25, Number(raw.speed) || 1);
  const cycles = time * speed / duration;
  const phase = raw.loop === false ? Math.min(1, Math.max(0, cycles)) : ((cycles % 1) + 1) % 1;
  const smooth = (a, b, x) => { const v = Math.min(1, Math.max(0, (x - a) / (b - a))); return v * v * (3 - 2 * v); };
  const rise = smooth(.12, .47, phase);
  const fall = 1 - smooth(.58, .94, phase);
  const envelope = Math.max(0, rise * fall);
  const reconstruct = Math.min(1, Math.max(0, Number(raw.reconstruction) || 0));
  return { phase, envelope: envelope * (1 - reconstruct * smooth(.65, .94, phase)),
    pulse: .1 + .9 * envelope, angle: phase * Math.PI * 2 };
}
