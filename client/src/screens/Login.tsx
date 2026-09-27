import { APP_NAME } from '@frog/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FrogGlyph } from '../components/Icons';
import { ApiError } from '../data/api';
import { useData } from '../data/store';
import { signIn } from '../data/sync';

export function LoginScreen() {
  const status = useData((s) => s.status);
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status !== 0
          ? err.message
          : 'Could not reach the server. Check your connection and try again.',
      );
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="login__form" onSubmit={submit}>
        <span className="login__glyph">
          <FrogGlyph size={40} />
        </span>
        <h1 className="visually-hidden">{APP_NAME}</h1>
        <label className="visually-hidden" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="field"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
        />
        <button className="btn btn--ink btn--block" type="submit" disabled={busy}>
          Sign in
        </button>
        {error && (
          <p className="login__error" role="alert">
            {error}
          </p>
        )}
        {status === 'offlineNoData' && !error && (
          <p className="login__note">You're offline. Connect to the internet to sign in.</p>
        )}
      </form>
    </main>
  );
}
