# Card textures

Drop your Trešeta card artwork here. The game loads images by suit and rank:

```
/cards/back.png          -> face-down card back
/cards/cups-1.png        -> Ace of cups
/cards/cups-7.png
/cards/cups-K.png
/cards/coins-1.png ... /cards/coins-K.png
/cards/swords-1.png ... /cards/swords-K.png
/cards/batons-1.png ... /cards/batons-K.png
```

That's 40 face cards + 1 back = 41 images.

Recommended: PNG, ~2:3 portrait aspect (e.g. 600×900). Any size works — the
CSS uses `object-fit: cover`, so your art will fill the card box.

File names must match exactly: `{suit}-{rank}.png` where suit is one of
`cups`, `coins`, `swords`, `batons` and rank is one of `1`, `2`, `3`, `4`, `5`,
`6`, `7`, `J`, `Q`, `K`. (`1` is the Ace.)

To turn textures on, flip `CARD_IMAGE_MODE` in `client/src/lib/cardImages.ts`
from `'text'` to `'image'`. Until then the game keeps its current text/emoji
look, and any missing image silently falls back to text.

The files in this folder are served at `/cards/...` by Vite, so no rebuild is
needed when you add or replace artwork.
