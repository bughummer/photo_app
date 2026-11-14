export function clampTime(time, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(duration, Math.max(0, Number.isFinite(time) ? time : 0));
}

export function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function frameTimes(duration, frameRate = 24) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(frameRate) || frameRate <= 0) throw new Error('Invalid video timeline');
  const count = Math.ceil(duration * frameRate);
  return Array.from({ length: count }, (_, index) => index / frameRate);
}
