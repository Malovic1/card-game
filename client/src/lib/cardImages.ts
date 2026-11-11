import type { Card } from '../types';
import { RANKS, SUITS } from '../types';

/**
 * Card texture preparation.
 *
 * Drop real card artwork into client/public/cards/ using this naming scheme:
 *
 *   /cards/cups-1.png    (Ace of cups)
 *   /cards/cups-K.png
 *   /cards/coins-7.png
 *   /cards/swords-J.png
 *   /cards/batons-Q.png
 *   ...
 *   /cards/back.png      (face-down card back)
 *
 * Supported extensions: png, jpg, webp, svg. Set CARD_IMAGE_EXT to match your files.
 *
 * Set CARD_IMAGE_MODE to 'image' once you have the textures. While it stays
 * 'text' (the default) the game looks exactly as it does now — icons and text
 * are untouched. Whenever you flip to 'image', any missing or failed image
 * silently falls back to the current text/emoji rendering, so nothing breaks
 * while you're still drawing the art.
 */

export type CardImageMode = 'text' | 'image';

export const CARD_IMAGE_MODE: CardImageMode = 'text';
export const CARD_IMAGE_EXT = 'png';
export const CARDS_DIR = '/cards';

export function cardFaceUrl(card: Card): string {
  return `${CARDS_DIR}/${card.suit}-${card.rank}.${CARD_IMAGE_EXT}`;
}

export function cardBackUrl(): string {
  return `${CARDS_DIR}/back.${CARD_IMAGE_EXT}`;
}

export function allCardFaceUrls(): string[] {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => `${CARDS_DIR}/${suit}-${rank}.${CARD_IMAGE_EXT}`),
  );
}

export function allCardUrls(): string[] {
  return [...allCardFaceUrls(), cardBackUrl()];
}

/**
 * Preload every card texture into the browser cache. Safe to call before the
 * first hand is dealt. Resolves even when individual images are missing
 * (development), so a single absent texture never blocks the game.
 */
export async function preloadCardImages(): Promise<void> {
  await Promise.all(
    allCardUrls().map((src) => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = src;
      });
    }),
  );
}
