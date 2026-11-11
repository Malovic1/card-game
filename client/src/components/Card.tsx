import { useState } from 'react';
import type { Card } from '../types';
import { RANK_LABELS, SUIT_LABELS } from '../types';
import { cardColor, rankGlyph, suitSymbol } from '../lib/cards';
import { CARD_IMAGE_MODE, cardBackUrl, cardFaceUrl } from '../lib/cardImages';

export type CardSize = 'mini' | 'normal' | 'played';

interface CardProps {
  /** null renders the face-down card back */
  card: Card | null;
  size?: CardSize;
  /** Render face up. When false (or card is null) the back is shown. */
  faceUp?: boolean;
  onClick?: () => void;
  className?: string;
  title?: string;
}

export function Card({
  card,
  size = 'normal',
  faceUp = true,
  onClick,
  className = '',
  title,
}: CardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = CARD_IMAGE_MODE === 'image' && !imageFailed;
  const isBack = !card || !faceUp;
  const defaultTitle = card
    ? `${RANK_LABELS[card.rank]} · ${SUIT_LABELS[card.suit]}`
    : 'Karta lice prema dolu';

  const Tag = onClick ? 'button' : 'div';
  const classes = [
    'card',
    size,
    isBack ? 'face-down' : 'face-up',
    isBack ? 'back' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag
      className={classes}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      title={title ?? defaultTitle}
      aria-label={title ?? defaultTitle}
    >
      {showImage && card && faceUp ? (
        <img
          className="card-image"
          src={cardFaceUrl(card)}
          alt={title ?? defaultTitle}
          onError={() => setImageFailed(true)}
          decoding="async"
        />
      ) : showImage && isBack ? (
        <img
          className="card-image"
          src={cardBackUrl()}
          alt={defaultTitle}
          onError={() => setImageFailed(true)}
          decoding="async"
        />
      ) : isBack ? (
        null
      ) : (
        <>
          <div className="rank" style={{ color: cardColor(card!.suit) }}>
            {rankGlyph(card!.rank)}
          </div>
          <div className="suit">{suitSymbol(card!.suit)}</div>
        </>
      )}
    </Tag>
  );
}
