/**
 * Pure decision for whether the desktop service row needs the Embla
 * carousel: only once the card count exceeds what fits at the design width
 * (about four cards at 1080px, see `docs/intent/photography-studio.md`,
 * "Experience"). Mobile always stays the stacked layout regardless of this
 * result (see `odd/tasks/media-interactions.md`, MI-05).
 */
export function shouldUseCarousel(count: number, visibleAtDesignWidth = 4): boolean {
  return count > visibleAtDesignWidth;
}
