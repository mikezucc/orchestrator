# Maintenance

The following instructions are NOT for coding agents. These are ONLY for developers to interact with on manual maintenace operations.

## SSL

To update the SSL certificates, they are located here:
 
*Note: the cert contains a wildcard origin so we reference the same file for both api. and @.

```bash
ssl_certificate /etc/nginx/ssl/onpaper.dev.crt;
ssl_certificate_key /etc/nginx/ssl/onpaper.dev.key;
```

```bash
sudo nano /etc/nginx/ssl/onpaper.dev.crt
sudo nano /etc/nginx/ssl/onpaper.dev.key
```

They are referenced in the nginx config here:

```bash
sudo nano /etc/nginx/sites-available/api.onpaper.dev
sudo nano /etc/nginx/sites-available/onpaper.dev
```

Copy the contents of the domain cert into the .crt file.

Copy the contents of the private key file into the .key file.

Restart NGINX:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Optional: Reboot the services.

The SSR build on the toaster VM takes 90 seconds FYI.

```bash
cd ~/paper
git reset --hard origin/main
git pull
pnpm i
cd packages/frontend
pnpm run build
pnpm run build:ssr
cd ../backend
pm2 delete services
pm2 start pnpm --name "services" -- run dev
```