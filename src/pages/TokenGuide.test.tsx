import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderAt } from '../test/render';
import { FAKE_TOKEN, TOKEN_STORAGE_KEY } from './token-guide/token';

describe('TokenGuide', () => {
  it('only ever shows the fake token', () => {
    renderAt('/guide/token');
    expect(FAKE_TOKEN).toBe('eyJhbGciOiJIUzI1NiJ9.EXAMPLE.NOT-A-REAL-TOKEN');
    expect(screen.getAllByText(FAKE_TOKEN).length).toBeGreaterThan(0);
  });

  it('names the storage key to copy', () => {
    renderAt('/guide/token');
    expect(screen.getAllByText(TOKEN_STORAGE_KEY).length).toBeGreaterThan(0);
  });

  it('starts on Chrome / Edge and switches to Firefox', async () => {
    renderAt('/guide/token');
    expect(screen.getByRole('tab', { name: 'Chrome / Edge' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Application');
    await userEvent.click(screen.getByRole('tab', { name: 'Firefox' }));
    expect(screen.getByRole('tab', { name: 'Firefox' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Storage');
  });

  it('moves between browser tabs with the arrow keys', async () => {
    renderAt('/guide/token');
    screen.getByRole('tab', { name: 'Chrome / Edge' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Firefox' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Firefox' })).toHaveAttribute('aria-selected', 'true');
  });

  it('warns that the token can change your sets', () => {
    renderAt('/guide/token');
    expect(screen.getByText(/anyone with this token can change your emote sets/i)).toBeInTheDocument();
  });
});
