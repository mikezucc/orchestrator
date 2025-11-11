# Maintenance

The following instructions are NOT for coding agents. These are ONLY for developers to interact with on manual maintenace operations.

## SSL

To update the SSL certificates, they are located here:
 
*Note: the cert contains a wildcard origin so we reference the same file for both api. and @.

```bash
ssl_certificate /etc/nginx/ssl/onpaper.dev.crt;
ssl_certificate_key /etc/nginx/ssl/onpaper.dev.key;
```

They are referenced in the nginx config here:

```bash
sudo nano /etc/nginx/sites-available/api.onpaper.dev
sudo nano /etc/nginx/sites-available/onpaper.dev
```

