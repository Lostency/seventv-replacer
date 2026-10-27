import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { SiteFooter } from '../design/SiteFooter';
import { SiteHeader } from '../design/SiteHeader';
import { DevtoolsChrome } from './token-guide/DevtoolsChrome';
import { DevtoolsFirefox } from './token-guide/DevtoolsFirefox';
import { SEVENTV_ORIGIN, TOKEN_STORAGE_KEY } from './token-guide/token';
import styles from './TokenGuide.module.css';

type Browser = 'chrome' | 'firefox';

interface BrowserGuide {
  id: Browser;
  label: string;
  panelName: string;
  steps: ReactNode[];
  picture: ReactNode;
  description: string;
}

const Key = ({ children }: { children: ReactNode }) => <kbd className={styles.kbd}>{children}</kbd>;

const sharedFirst = [
  <>
    Sign in at{' '}
    <a href={SEVENTV_ORIGIN} target="_blank" rel="noreferrer">
      7tv.app
    </a>{' '}
    with the account that manages your emotes.
  </>,
  <>
    Open the developer tools: <Key>F12</Key> on Windows, or <Key>Cmd</Key> <Key>Option</Key> <Key>I</Key> on a Mac.
  </>,
];

const sharedLast = [
  <>
    Click the row named <code className={styles.code}>{TOKEN_STORAGE_KEY}</code>, double-click its value and copy it:{' '}
    <Key>Ctrl</Key> <Key>C</Key>, or <Key>Cmd</Key> <Key>C</Key> on a Mac.
  </>,
  <>Paste it into the token field on the Replace page. It stays in this browser.</>,
];

const GUIDES: BrowserGuide[] = [
  {
    id: 'chrome',
    label: 'Chrome / Edge',
    panelName: 'Application',
    steps: [
      ...sharedFirst,
      <>
        Open the <strong>Application</strong> tab. If you can’t see it, it’s behind the <strong>»</strong> at the end
        of the tab row.
      </>,
      <>
        In the sidebar, open <strong>Local storage</strong> and click <strong>{SEVENTV_ORIGIN}</strong>.
      </>,
      ...sharedLast,
    ],
    picture: <DevtoolsChrome />,
    description: `Chrome DevTools with the Application tab open, Local storage expanded, ${SEVENTV_ORIGIN} selected, and the ${TOKEN_STORAGE_KEY} row highlighted.`,
  },
  {
    id: 'firefox',
    label: 'Firefox',
    panelName: 'Storage',
    steps: [
      ...sharedFirst,
      <>
        Open the <strong>Storage</strong> tab.
      </>,
      <>
        In the sidebar, open <strong>Local Storage</strong> and click <strong>{SEVENTV_ORIGIN}</strong>.
      </>,
      ...sharedLast,
    ],
    picture: <DevtoolsFirefox />,
    description: `Firefox DevTools with the Storage tab open, Local Storage expanded, ${SEVENTV_ORIGIN} selected, and the ${TOKEN_STORAGE_KEY} row highlighted.`,
  },
];

export function TokenGuide() {
  const [browser, setBrowser] = useState<Browser>('chrome');
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const guide = GUIDES.find((g) => g.id === browser)!;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = GUIDES[(index + step + GUIDES.length) % GUIDES.length]!;
    setBrowser(next.id);
    tabs.current[GUIDES.indexOf(next)]?.focus();
  };

  return (
    <>
      <SiteHeader />
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.heading}>Get your 7TV token</h1>
          <p className={styles.lede}>
            7TV doesn’t offer a “sign in with 7TV” button for other tools, so Replace uses the token your browser
            already holds for 7tv.app. Finding it takes about a minute.
          </p>
          <p className={styles.warning}>
            <strong>Anyone with this token can change your emote sets.</strong> Don’t share it or paste it anywhere
            else. This tool keeps it in your browser and only ever sends it to 7TV.
          </p>
        </div>

        <div className={styles.tablist} role="tablist" aria-label="Your browser">
          {GUIDES.map((g, index) => (
            <button
              key={g.id}
              ref={(el) => {
                tabs.current[index] = el;
              }}
              id={`tab-${g.id}`}
              type="button"
              role="tab"
              aria-selected={g.id === browser}
              aria-controls={`panel-${g.id}`}
              tabIndex={g.id === browser ? 0 : -1}
              className={styles.tab}
              onClick={() => setBrowser(g.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {g.label}
            </button>
          ))}
        </div>

        <section
          id={`panel-${guide.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${guide.id}`}
          className={styles.panel}
        >
          <ol className={styles.steps}>
            {guide.steps.map((step, i) => (
              <li key={i} className={styles.step}>
                {step}
              </li>
            ))}
          </ol>
          <figure className={styles.figure}>
            {guide.picture}
            <figcaption className={styles.caption}>
              {guide.description} The value shown is an example, not a real token.
            </figcaption>
          </figure>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
