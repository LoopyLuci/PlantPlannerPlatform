import { VIEWS, type ViewId } from './windows';

/** The side rail that selects which window is open. */
export function Nav(props: { current: ViewId; counts: Partial<Record<ViewId, number>>; onNavigate: (view: ViewId) => void }) {
  return (
    <nav className="nav" aria-label="Windows">
      <ul>
        {VIEWS.map((view) => {
          const count = props.counts[view.id];
          return (
            <li key={view.id}>
              <button
                type="button"
                className="nav-item"
                aria-current={props.current === view.id ? 'page' : undefined}
                onClick={() => props.onNavigate(view.id)}
              >
                <span>{view.label}</span>
                {count !== undefined && count > 0 && <span className="nav-count" aria-label={`${count} items`}>{count}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
