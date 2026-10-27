import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Keycap } from './Keycap';

const ID = 'A'.repeat(26);

describe('Keycap', () => {
  it('loads the cached image first', () => {
    render(<Keycap emoteId={ID} alt="peepoHappy" />);
    expect(screen.getByAltText('peepoHappy')).toHaveAttribute('src', `/emote-images/${ID}.webp`);
  });

  it('falls back to the 7TV CDN when the cached image fails', () => {
    render(<Keycap emoteId={ID} alt="peepoHappy" />);
    const img = screen.getByAltText('peepoHappy');
    fireEvent.error(img);
    expect(img).toHaveAttribute('src', `https://cdn.7tv.app/emote/${ID}/2x.webp`);
  });

  it('goes back to the cache for a new emote after a fallback', () => {
    const { rerender } = render(<Keycap emoteId={ID} alt="a" />);
    fireEvent.error(screen.getByAltText('a'));
    rerender(<Keycap emoteId={'B'.repeat(26)} alt="b" />);
    expect(screen.getByAltText('b')).toHaveAttribute('src', `/emote-images/${'B'.repeat(26)}.webp`);
  });
});
