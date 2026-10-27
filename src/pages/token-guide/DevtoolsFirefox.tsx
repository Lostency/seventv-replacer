import { ChevronDown, ChevronRight } from 'lucide-react';
import { FAKE_TOKEN, SEVENTV_ORIGIN, TOKEN_STORAGE_KEY } from './token';
import styles from './devtools.module.css';

const TABS = ['Inspector', 'Console', 'Debugger', 'Network', 'Style Editor', 'Performance', 'Storage'];

/** A recreation of Firefox DevTools' Storage panel, pointing at the row to copy. */
export function DevtoolsFirefox() {
  return (
    <div className={`${styles.window} ${styles.firefox}`} aria-hidden="true">
      <div className={styles.tabbar}>
        {TABS.map((tab) => (
          <span key={tab} className={tab === 'Storage' ? styles.tabActive : styles.tab}>
            {tab}
          </span>
        ))}
      </div>
      <div className={styles.split}>
        <div className={styles.sidebar}>
          <p className={styles.item}><ChevronRight className={styles.caret} />Cache Storage</p>
          <p className={styles.item}><ChevronRight className={styles.caret} />Cookies</p>
          <p className={styles.item}><ChevronRight className={styles.caret} />Indexed DB</p>
          <p className={styles.item}><ChevronDown className={styles.caret} />Local Storage</p>
          <p className={`${styles.item} ${styles.nested} ${styles.selected}`}>{SEVENTV_ORIGIN}</p>
          <p className={styles.item}><ChevronRight className={styles.caret} />Session Storage</p>
        </div>
        <div className={styles.table}>
          <div className={styles.head}>
            <span>Key</span>
            <span>Value</span>
          </div>
          <div className={`${styles.row} ${styles.highlight}`}>
            <span>{TOKEN_STORAGE_KEY}</span>
            <span className={styles.value}>{FAKE_TOKEN}</span>
          </div>
          <div className={styles.row} />
          <div className={styles.row} />
          <div className={styles.row} />
          <div className={styles.preview}>
            <span className={styles.previewLabel}>Data</span>
            <span className={styles.value}>
              {TOKEN_STORAGE_KEY}: "{FAKE_TOKEN}"
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
