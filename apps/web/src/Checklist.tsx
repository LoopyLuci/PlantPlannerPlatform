import { useEffect, useState } from 'react';

/**
 * A short, dismissible guide to the core loop. Progress is kept on this device
 * only. Nothing in it is needed for the design itself.
 */

const ITEMS = [
  { id: 'why', label: 'Select a plant and read why it is there' },
  { id: 'suggest', label: 'Ask for suggestions for an empty spot' },
  { id: 'site', label: 'Change a site condition and watch the verdicts update' },
  { id: 'undo', label: 'Undo a change with Ctrl+Z' },
] as const;

const KEY = 'ppp.checklist.v1';
const DISMISSED = 'ppp.checklist.dismissed';

type Done = Record<string, boolean>;

function load(): Done {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Done;
  } catch {
    return {};
  }
}

function save(done: Done): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(done));
  } catch {
    // Storage may be blocked. The checklist then simply does not persist.
  }
}

export function Checklist({ hasSelection }: { hasSelection: boolean; placementCount: number }) {
  const [done, setDone] = useState<Done>(() => load());
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISSED) === 'yes';
    } catch {
      return false;
    }
  });
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    if (hasSelection && !done.why) {
      const next = { ...done, why: true };
      setDone(next);
      save(next);
    }
  }, [hasSelection, done]);

  if (dismissed) return null;
  const count = ITEMS.filter((item) => done[item.id]).length;

  const toggle = (id: string) => {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    save(next);
  };

  if (collapsed) {
    return (
      <button type="button" className="checklist-pill" onClick={() => setCollapsed(false)}>
        Getting started · {count}/{ITEMS.length}
      </button>
    );
  }

  return (
    <section className="checklist" aria-label="Getting started">
      <div className="section-head">
        <h2>Getting started · {count}/{ITEMS.length}</h2>
        <div>
          <button type="button" className="ghost" onClick={() => setCollapsed(true)}>Minimise</button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              try {
                window.localStorage.setItem(DISMISSED, 'yes');
              } catch {
                // Ignored: the card stays for this session.
              }
              setDismissed(true);
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
      <ul>
        {ITEMS.map((item) => (
          <li key={item.id}>
            <label className="check">
              <input type="checkbox" checked={Boolean(done[item.id])} onChange={() => toggle(item.id)} />
              <span>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
