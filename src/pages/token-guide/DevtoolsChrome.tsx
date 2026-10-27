import { ChevronDown, ChevronRight } from 'lucide-react';
import { FAKE_TOKEN, SEVENTV_ORIGIN, TOKEN_STORAGE_KEY } from './token';
import styles from './devtools.module.css';

const TABS = ['Elements', 'Console', 'Sources', 'Network', 'Performance', 'Memory', 'Application'];

/** A recreation of Chrome/Edge DevTools' Application panel, pointing at the row to copy. */
export function DevtoolsChrome() {
  return (
    <div className={`${styles.window} ${styles.chrome}`} aria-hidden="true">
      <div className={styles.tabbar}>
        {TABS.map((tab) => (
          <span key={tab} className={tab === 'Application' ? styles.tabActive : styles.tab}>
            {tab}
          </span>
        ))}
      </div>
      <div className={styles.split}>
        <div className={styles.sidebar}>
          <p className={styles.group}>Application</p>
          <p className={styles.item}>Manifest</p>
          <p className={styles.item}>Service workers</p>
          <p className={styles.group}>Storage</p>
          <p className={styles.item}><ChevronDown className={styles.caret} />Local storage</p>
          <p className={`${styles.item} ${styles.nested} ${styles.selected}`}>{SEVENTV_ORIGIN}</p>
          <p className={styles.item}><ChevronRight className={styles.caret} />Session storage</p>
          <p className={styles.item}><ChevronRight className={styles.caret} />IndexedDB</p>
          <p className={styles.item}><ChevronRight className={styles.caret} />Cookies</p>
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
            <span className={styles.previewLabel}>Value</span>
            <span className={styles.value}>{FAKE_TOKEN}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
