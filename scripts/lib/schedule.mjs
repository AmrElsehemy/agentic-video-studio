// The show's publishing cadence: daily UTC slots, filled in order. A new upload takes the first slot after
// everything already on the channel (public or scheduled), and never sooner than `lead` minutes from now.
const DAY = 86_400_000;

export const nextSlot = (slots, {after, now = new Date(), leadMinutes = 30}) => {
  const times = [...slots].sort().map((slot) => slot.split(':').map(Number));
  const earliest = Math.max(after ? Date.parse(after) + 1 : 0, now.getTime() + leadMinutes * 60_000);
  const day = Math.floor(earliest / DAY) * DAY;
  for (let offset = 0; offset < 3; offset++) for (const [hour, minute] of times) {
    const at = day + offset * DAY + (hour * 60 + minute) * 60_000;
    if (at >= earliest) return new Date(at).toISOString().replace('.000Z', 'Z');
  }
  throw new Error('No slot found');
};

/** The latest time already taken on the channel: a scheduled publish time or a publish date. */
export const latestTaken = (videos) => videos.map((video) => video.publishAt ?? video.publishedAt).filter(Boolean).sort().at(-1);
