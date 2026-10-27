import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Knob } from './Knob';

const opts = [
  { value: 'normal', label: 'Normal' },
  { value: 'halloween', label: 'Halloween' },
  { value: 'winter', label: 'Winter' },
];

describe('Knob', () => {
  it('moves one detent per arrow key without wrapping', async () => {
    const onChange = vi.fn();
    render(<Knob label="Season" options={opts} value="winter" onChange={onChange} />);
    await userEvent.type(screen.getByRole('radio', { name: 'Winter' }), '{ArrowRight}{ArrowLeft}');
    expect(onChange.mock.calls).toEqual([['halloween']]);
  });

  it('exposes the current detent', () => {
    render(<Knob label="Season" options={opts} value="halloween" onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Season' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Halloween' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Normal' })).not.toBeChecked();
  });

  it('selects a detent by clicking its label', async () => {
    const onChange = vi.fn();
    render(<Knob label="Season" options={opts} value="normal" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Winter' }));
    expect(onChange).toHaveBeenCalledWith('winter');
  });
});
