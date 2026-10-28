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

describe('Keycap links', () => {
  it('opens the emote’s 7TV page in a new tab', () => {
    render(<Keycap emoteId={ID} alt="peepoHappy" />);
    const link = screen.getByRole('link', { name: 'peepoHappy on 7TV' });
    expect(link).toHaveAttribute('href', `https://7tv.app/emotes/${ID}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('keeps a decorative cap out of the tab order', () => {
    render(<Keycap emoteId={ID} alt="" />);
    const link = document.querySelector('a');
    expect(link).toHaveAttribute('href', `https://7tv.app/emotes/${ID}`);
    expect(link).toHaveAttribute('tabindex', '-1');
    expect(link).toHaveAttribute('aria-hidden', 'true');
  });

  it('is no link while blank', () => {
    render(<Keycap alt="" />);
    expect(document.querySelector('a')).toBeNull();
  });
});
