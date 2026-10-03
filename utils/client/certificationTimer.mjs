// Each question owns one deadline. Answer changes update the caller's callback,
// never this deadline, and a delayed browser tick still expires the question.
export function startCertificationQuestionTimer({ onTick, onExpire, durationSeconds = 45, deadlineAt, now = Date.now, schedule = setInterval, cancel = clearInterval }) {
  const deadline = Number.isFinite(deadlineAt) ? deadlineAt : now() + durationSeconds * 1000;
  let ended = false;
  const interval = schedule(() => {
    if (ended) return;
    const remaining = Math.max(0, Math.min(durationSeconds, Math.ceil((deadline - now()) / 1000)));
    onTick(remaining);
    if (remaining === 0) {
      ended = true;
      cancel(interval);
      onExpire();
    }
  }, 500);
  return () => { ended = true; cancel(interval); };
}
