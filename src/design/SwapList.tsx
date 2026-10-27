import { ArrowRight } from 'lucide-react';
import { Keycap } from './Keycap';
import { TickBox } from './TickBox';
import styles from './SwapList.module.css';

export interface SwapItem {
  key: string;
  alias: string;
  fromId: string;
  toId: string;
}

interface SwapListProps {
  items: SwapItem[];
  /** Keys of the rows the user has unticked. Every other row is ticked. */
  unticked: ReadonlySet<string>;
  onChange(unticked: Set<string>): void;
  label: string;
}

/** Each emote beside the one that replaces it, all ticked, each untickable. */
export function SwapList({ items, unticked, onChange, label }: SwapListProps) {
  const ticked = items.length - items.filter((i) => unticked.has(i.key)).length;
  const toggle = (key: string, on: boolean) => {
    const next = new Set(unticked);
    if (on) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <p className={styles.count}>
          {ticked} of {items.length} ticked
        </p>
        <button type="button" className={styles.bulk} onClick={() => onChange(new Set())}>
          Tick all
        </button>
        <button type="button" className={styles.bulk} onClick={() => onChange(new Set(items.map((i) => i.key)))}>
          Untick all
        </button>
      </div>
      <ul className={styles.list} aria-label={label}>
        {items.map((item) => {
          const on = !unticked.has(item.key);
          return (
            <li key={item.key} className={styles.row} data-off={!on || undefined}>
              <TickBox checked={on} onChange={(value) => toggle(item.key, value)} label={item.alias} />
              <div className={styles.pair} aria-hidden="true">
                <Keycap emoteId={item.fromId} alt="" />
                <ArrowRight className={styles.arrow} size={18} strokeWidth={2.5} />
                <Keycap emoteId={item.toId} alt="" state={on ? 'flipped' : 'idle'} tone="putty" />
              </div>
              <span className={styles.alias}>{item.alias}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
