import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { SEASONS, seasonLabel } from '@shared/seasons';
import { ActionKey } from '../design/ActionKey';
import { AmberScreen } from '../design/AmberScreen';
import { DeckField } from '../design/DeckField';
import { Keycap } from '../design/Keycap';
import { Knob } from '../design/Knob';
import { SiteFooter } from '../design/SiteFooter';
import { SiteHeader } from '../design/SiteHeader';
import { BuiltFromRealSets } from './landing/BuiltFromRealSets';
import { HowItWorks } from './landing/HowItWorks';
import { MadeBy } from './landing/MadeBy';
import { SafeByDefault } from './landing/SafeByDefault';
import { useDeck, type Dial } from './landing/useDeck';
import styles from './Landing.module.css';

const DIAL_OPTIONS: { value: Dial; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  ...SEASONS.map((s) => ({ value: s, label: seasonLabel(s) })),
];

export function Landing() {
  const deck = useDeck();
  const navigate = useNavigate();
  const [channel, setChannel] = useState('');
  const [error, setError] = useState<string>();
  const channelInput = useRef<HTMLInputElement>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = channel.trim();
    if (!name) {
      setError('Type your channel name first.');
      channelInput.current?.focus();
      return;
    }
    navigate(`/replace?${new URLSearchParams({ channel: name, season: deck.season })}`);
  };

  return (
    <>
      <SiteHeader />
      <main>
        <form className={styles.first} onSubmit={submit} noValidate>
          <div className={styles.pitch}>
            <h1 className={styles.headline}>One key makes your set seasonal.</h1>
            <p className={styles.promise}>
              Type your Twitch channel, turn the knob to Halloween or Winter, and press the orange key. You see every
              swap before anything changes, and Undo reverses every swap it made.
            </p>
            <DeckField
              label="Your Twitch channel"
              placeholder="channel name"
              value={channel}
              onChange={(value) => {
                setChannel(value);
                if (error) setError(undefined);
              }}
              error={error}
              inputRef={channelInput}
            />
          </div>

          <div className={styles.deck}>
            <AmberScreen className={styles.screen}>{deck.readout}</AmberScreen>
            <div className={styles.body}>
              <div className={styles.keys} aria-hidden="true">
                {deck.keys.map((key, i) => (
                  <Keycap
                    key={i}
                    emoteId={key.emoteId}
                    alt=""
                    legend={String(i + 1)}
                    tone={i % 3 === 2 ? 'putty' : 'bone'}
                    state={deck.presetFailed ? 'unmapped' : key.flipped ? 'flipped' : 'idle'}
                  />
                ))}
              </div>
              <div className={styles.controls}>
                <div className={styles.knob}>
                  <Knob label="Season" options={DIAL_OPTIONS} value={deck.dial} onChange={deck.setDial} />
                </div>
                <ActionKey type="submit" className={styles.action}>
                  Make seasonal
                </ActionKey>
              </div>
            </div>
          </div>
        </form>

        <HowItWorks />
        <SafeByDefault />
        <BuiltFromRealSets stats={deck.stats} />
        <MadeBy />
      </main>
      <SiteFooter />
    </>
  );
}
