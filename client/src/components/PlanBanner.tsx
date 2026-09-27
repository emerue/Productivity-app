import { addDays, isPlanningWindow, type DateStr } from '@frog/shared';
import { Link } from 'react-router-dom';
import { useData } from '../data/store';
import { useNow } from '../lib/time';

/** From plan time until the day boundary, while tomorrow is not planned. */
export function PlanBanner({ today }: { today: DateStr }) {
  const now = useNow();
  const settings = useData((s) => s.settings);
  const tomorrowPlanned = useData((s) => s.days[addDays(today, 1)]?.planned ?? false);
  if (tomorrowPlanned || !isPlanningWindow(now, settings)) return null;

  return (
    <div className="plan-banner" role="region" aria-label="Plan tomorrow">
      <p>Plan tomorrow. Takes a minute.</p>
      <Link to="/plan" className="btn btn--secondary btn--small">
        Plan
      </Link>
    </div>
  );
}
