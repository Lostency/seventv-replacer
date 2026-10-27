import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import styles from './Knob.module.css';

interface KnobOption<T extends string> {
  value: T;
  label: string;
}

interface KnobProps<T extends string> {
  label: string;
  options: KnobOption<T>[];
  value: T;
  onChange(value: T): void;
}

const SWEEP = 120; // degrees between the first and last detent

function detentAngle(index: number, count: number): number {
  return count < 2 ? 0 : -SWEEP / 2 + (SWEEP * index) / (count - 1);
}

/**
 * A knurled knob with one detent per option. Semantically a radio group:
 * arrow keys step one detent (no wrap), clicking a label jumps to it, and
 * dragging the knob face snaps to the nearest detent.
 */
export function Knob<T extends string>({ label, options, value, onChange }: KnobProps<T>) {
  const radios = useRef<Array<HTMLButtonElement | null>>([]);
  const dial = useRef<HTMLDivElement>(null);
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const select = (index: number, focus = false) => {
    const option = options[index];
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    if (focus) radios.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    select(current + step, true);
  };

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.type === 'pointerdown') event.currentTarget.setPointerCapture(event.pointerId);
    else if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const box = dial.current?.getBoundingClientRect();
    if (!box) return;
    const x = event.clientX - (box.left + box.width / 2);
    const y = event.clientY - (box.top + box.height / 2);
    const angle = (Math.atan2(x, -y) * 180) / Math.PI;
    let nearest = 0;
    options.forEach((_, i) => {
      if (Math.abs(detentAngle(i, options.length) - angle) < Math.abs(detentAngle(nearest, options.length) - angle)) {
        nearest = i;
      }
    });
    select(nearest);
  };

  return (
    <div className={styles.knob} role="radiogroup" aria-label={label}>
      <div
        ref={dial}
        className={styles.dial}
        aria-hidden="true"
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        style={{ '--angle': `${detentAngle(current, options.length)}deg` } as CSSProperties}
      >
        <div className={styles.face}>
          <span className={styles.pointer} />
        </div>
      </div>
      <div className={styles.detents}>
        {options.map((option, index) => {
          const checked = index === current;
          return (
            <button
              key={option.value}
              ref={(el) => {
                radios.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              className={styles.detent}
              onClick={() => select(index)}
              onKeyDown={onKeyDown}
            >
              <span className={styles.tick} aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
