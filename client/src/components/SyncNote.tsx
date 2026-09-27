import { Link } from 'react-router-dom';
import { useData } from '../data/store';

/** Nothing when healthy. Otherwise one quiet line under the header. */
export function SyncNote() {
  const { online, failures, authRequired } = useData((s) => s.sync);

  if (authRequired) {
    return (
      <p className="sync-note" role="status">
        <Link to="/login">Sign in again to sync</Link>. Your changes are safe on this device.
      </p>
    );
  }
  if (!online) {
    return (
      <p className="sync-note" role="status">
        Offline. Changes are saved on this device.
      </p>
    );
  }
  if (failures >= 3) {
    return (
      <p className="sync-note" role="status">
        Can't reach the server. Your changes are safe on this device.
      </p>
    );
  }
  return null;
}
