/** Asks once, inside a user gesture. Used only for the end-of-timer notice. */
export function requestNotifyPermission(): void {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch {
    // Unsupported.
  }
}

/**
 * Local notification while the page is alive. Background delivery in a PWA
 * is not reliable, so this is a courtesy, never the only signal.
 */
export async function notify(title: string, body: string): Promise<void> {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg)
      await reg.showNotification(title, { body, icon: '/icons/icon-192.png', tag: 'frog-timer' });
    else new Notification(title, { body, icon: '/icons/icon-192.png', tag: 'frog-timer' });
  } catch {
    // Not allowed here (e.g. iOS outside an installed app).
  }
}
