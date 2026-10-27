/** Our own cached copy: served from this origin, so 7TV's CDN never rate-limits a page of keys. */
export function emoteImageUrl(id: string): string {
  return `/emote-images/${id}.webp`;
}

/** Straight from 7TV, for emotes the cache does not hold. */
export function emoteCdnUrl(id: string): string {
  return `https://cdn.7tv.app/emote/${id}/2x.webp`;
}
