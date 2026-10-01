# SYNS4033Router Linux Deployment

This guide covers a manual production deployment on Debian, Ubuntu, or Armbian using systemd and Nginx. Railway users should follow the deployment steps in the main README instead.

## Requirements

- Node.js 20 or newer
- npm
- Git
- Python 3.10 or newer for automation
- Nginx
- Optional: Cloudflared for public tunnel access

## Recommended Layout

```text
/mnt/hdd/
├── syns4033router/       # Application source
└── .syns4033router/      # Database, logs, and runtime data
```

Using a dedicated disk keeps browser automation data and the SQLite database away from limited system storage.

## Clone and Install

```bash
cd /mnt/hdd
git clone https://github.com/selendang666/syns4033router.git syns4033router
cd syns4033router
npm install
```

## Configure the Environment

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Replace Railway-only expressions such as `${{secret(32)}}` with real random values. For a manual deployment, set:

```env
NODE_ENV=production
PORT=20128
DATA_DIR=/mnt/hdd/.syns4033router
JWT_SECRET=replace-with-a-long-random-secret
INITIAL_PASSWORD=replace-with-a-secure-password
API_KEY_SECRET=replace-with-a-long-random-secret
```

Create the data directory:

```bash
mkdir -p /mnt/hdd/.syns4033router
```

## Build

```bash
npm run build
```

## Optional Python Automation

Create a virtual environment inside the backend directory:

```bash
python3 -m venv /mnt/hdd/syns4033router/backend/.venv
/mnt/hdd/syns4033router/backend/.venv/bin/pip install --upgrade pip
/mnt/hdd/syns4033router/backend/.venv/bin/pip install 'camoufox[geoip]' playwright requests
/mnt/hdd/syns4033router/backend/.venv/bin/python -m camoufox fetch
```

The backend resolves its automation interpreter from `<backend working directory>/.venv/bin/python`.

## systemd Service

Create `/etc/systemd/system/syns4033router.service`:

```ini
[Unit]
Description=SYNS4033Router Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/mnt/hdd/syns4033router/backend
EnvironmentFile=/mnt/hdd/syns4033router/backend/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
systemctl daemon-reload
systemctl enable --now syns4033router
systemctl status syns4033router
```

Follow logs with:

```bash
journalctl -u syns4033router -f
```

## Nginx Reverse Proxy

Create `/etc/nginx/sites-available/syns4033router`:

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:20128;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
```

Enable the site:

```bash
ln -s /etc/nginx/sites-available/syns4033router /etc/nginx/sites-enabled/syns4033router
nginx -t
systemctl reload nginx
```

The Express service already serves the production frontend, so Nginx only needs to proxy requests to the backend port.

## Optional Cloudflare Tunnel

Install and authenticate Cloudflared, then point the tunnel to Nginx:

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /root/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: router.example.com
    service: http://127.0.0.1:80
  - service: http_status:404
```

Restart the tunnel after changing its configuration.

## Database Backup and Migration

The SQLite database is stored below `DATA_DIR`. Back it up before updates:

```bash
systemctl stop syns4033router
cp /mnt/hdd/.syns4033router/db/data.sqlite /mnt/hdd/.syns4033router/db/data.sqlite.backup
systemctl start syns4033router
```

To migrate from the old V2 default directory:

```bash
systemctl stop syns4033router
mkdir -p /mnt/hdd/.syns4033router
cp -a /root/.syns4033router/. /mnt/hdd/.syns4033router/
systemctl start syns4033router
```

## Updating

```bash
cd /mnt/hdd/syns4033router
git pull --ff-only
npm install
npm run build
systemctl restart syns4033router
```

## Troubleshooting

### Backend does not start

```bash
systemctl status syns4033router
journalctl -u syns4033router --lines 100
```

Check that `WorkingDirectory`, `EnvironmentFile`, Node.js, and npm paths are correct.

### Public domain returns an error

Verify each layer:

```bash
curl http://127.0.0.1:20128/api/health
curl http://127.0.0.1/api/health
nginx -t
systemctl status nginx cloudflared
```

### Automation cannot find Python

```bash
ls -la /mnt/hdd/syns4033router/backend/.venv/bin/python
/mnt/hdd/syns4033router/backend/.venv/bin/python -c 'import camoufox; print("OK")'
```

Ensure the systemd `WorkingDirectory` points to `/mnt/hdd/syns4033router/backend`.

### Database changes do not appear

Confirm that the process and your inspection tool use the same path:

```bash
grep DATA_DIR /mnt/hdd/syns4033router/backend/.env
ls -lh /mnt/hdd/.syns4033router/db/data.sqlite
```
