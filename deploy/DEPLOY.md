# Deploying Frog

Frog is built and tested on your laptop. The VPS only receives the finished app (about 400 KB), installs its runtime packages and runs it. The VPS never compiles anything.

On the server, Frog lives in `/srv/frog` and runs as the `frog` user under systemd, on `127.0.0.1:3080`. It uses about 70 MB of RAM and is capped at 300 MB. It doesn't touch other projects, their folders, their ports or their Nginx sites.

```
/srv/frog/
  .env              secrets (root, mode 600)
  app -> releases/<stamp>   the live release (symlink)
  releases/         last 5 releases, for rollback
  data/             store.json, backups/, archive/ (frog, mode 700)
```

All commands below run on your laptop in **Git Bash**, from the project folder.

---

## 1. One-time setup on your laptop

**SSH key**, so deploys don't ask for the server password each time. Skip this if `ssh root@<vps-ip>` already logs in without a password.

```bash
ssh-keygen -t ed25519            # press Enter at every prompt (default file, no passphrase or one you like)
cat ~/.ssh/id_ed25519.pub | ssh root@<vps-ip> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
ssh root@<vps-ip> exit           # should not ask for a password now
```

**Tell the script which server to use.** `deploy/deploy.env` is git-ignored, so the address stays off GitHub:

```bash
echo 'FROG_HOST=root@<vps-ip>' > deploy/deploy.env
```

## 2. First deploy

```bash
deploy/deploy.sh
```

This builds, typechecks and tests on the laptop, uploads the release, and on the server:

- creates the `frog` user and `/srv/frog`
- installs Node.js 22 LTS if the server doesn't have Node 20.19+
- creates `/srv/frog/.env` with a random session secret
- installs the runtime packages and the systemd unit, and switches `app` to the new release

The first time, it stops with **"no password is set yet"**. That's expected.

## 3. Set your password

```bash
deploy/deploy.sh password
```

Type the password twice (hidden, at least 8 characters). It is hashed on your laptop, and only the bcrypt hash is sent to the server. Frog then starts, and the script prints `{"ok":true,...}` from `/api/health`.

To change the password later, run the same command.

## 4. Try it before you have a domain

```bash
deploy/deploy.sh tunnel
```

Leave it running and open **http://localhost:3080** in Chrome on the laptop. The browser treats `localhost` as secure, so sign-in, offline mode and the service worker all work. Ctrl+C closes the tunnel. Nothing is exposed on the server's public IP.

## 5. HTTPS on a subdomain (needed for the phone)

Installing Frog on your phone, offline mode, wake lock and (in V2) reminders all need HTTPS on a real domain. A bare IP won't do.

1. **DNS:** at your domain registrar, add an **A record**, for example `tasks` → `<vps-ip>`. Check it has propagated with `nslookup tasks.yourdomain.com` (it should return the VPS IP), which can take a few minutes.
2. **Certificate and Nginx site:**
   ```bash
   deploy/deploy.sh https tasks.yourdomain.com you@example.com
   ```
   On the server this:
   - installs certbot and its Nginx plugin if missing
   - gets a Let's Encrypt certificate (`certbot certonly --nginx`)
   - adds one Nginx site called `frog` from `deploy/nginx.conf.template`: HTTP→HTTPS redirect, proxy to Frog, gzip, cache rules and security headers
   - runs `nginx -t` before reloading; if the test fails, the Frog site is switched off again and the other sites keep running
   - checks automatic renewal with `certbot renew --dry-run`
3. **Check:** open `https://tasks.yourdomain.com/api/health` and expect `{"ok":true,...}`.

Your landing page on `http://<vps-ip>` keeps working. The Frog site only answers for its own hostname.

## 6. Install on your phone

- **iPhone (Safari):** open `https://tasks.yourdomain.com`, sign in, tap **Share → Add to Home Screen**.
- **Android (Chrome):** open it, sign in, tap **⋮ → Install app** (or accept the install prompt).

Frog then opens full-screen with its own icon, and keeps working offline once it has loaded.

---

## Everyday commands

| Command                     | What it does                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy/deploy.sh`          | Build, test, upload, switch to the new release, health check. If the health check fails, it switches back to the previous release by itself. |
| `deploy/deploy.sh status`   | Service state, live release, `/api/health`                                                                                                   |
| `deploy/deploy.sh rollback` | Go back to the previous release                                                                                                              |
| `deploy/deploy.sh password` | Set or change the password                                                                                                                   |
| `deploy/deploy.sh tunnel`   | Use Frog at `http://localhost:3080` over SSH                                                                                                 |
| `deploy/deploy.sh backup`   | Copy the daily backups to `./backups/daily` on your laptop                                                                                   |

Logs are on the server: `ssh root@<vps-ip> journalctl -u frog -f`.

## Backups

On the server, Frog writes:

- hourly backups (48 kept) to `/srv/frog/data/backups/hourly/`
- daily backups (30 kept) to `/srv/frog/data/backups/daily/`
- a backup before any import or schema migration

**Off-server copy.** Run this from your laptop now and then (once a week is sensible):

```bash
deploy/deploy.sh backup
```

On macOS, Linux or WSL you can use rsync instead:

```bash
rsync -avz root@<vps-ip>:/srv/frog/data/backups/daily/ ./frog-backups/daily/
```

**Restoring a backup:** use Settings → Import in the app and choose a backup file. The current data is backed up first.

## If something goes wrong

- **Health check failed:** the script prints the last 40 log lines and has already rolled back. Fix the problem and deploy again.
- **Won't start after a reboot:** run `deploy/deploy.sh status`. The usual cause is a missing `PASSWORD_HASH`; run `deploy/deploy.sh password`.
- **"Can't reach the server" in the app:** your changes are safe in the phone's local storage. Check `status`, then the Nginx site (`ssh root@<vps-ip> nginx -t`).
