# Remote Access to TachTach Admin — Cloudflare Tunnel

Run this AFTER completing the normal Pi setup (`pi-setup.sh`) and confirming
`http://tachtach.local:3000/admin` works on your local WiFi. This exposes that
same admin panel under a subdomain of `szvtech.org`, reachable from anywhere —
no port forwarding, works behind CGNAT, free.

Your domain is already on Cloudflare (bought there), so there's no nameserver
migration needed — this just adds one new subdomain that doesn't touch
anything else on the domain.

## 1. Install cloudflared on the Pi

```bash
ssh pi@tachtach.local
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install cloudflared
```

## 2. Authenticate and create the tunnel

```bash
cloudflared tunnel login
```
This opens a URL — open it on your PC, log into Cloudflare, pick `szvtech.org`.

```bash
cloudflared tunnel create tachtach
```
Note the tunnel ID it prints.

## 3. Configure routing

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```
Paste (replace `<TUNNEL_ID>` with the ID from step 2):
```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/pi/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: tachtach.szvtech.org
    service: http://localhost:3000
  - service: http_status:404
```

## 4. Point the DNS record at the tunnel

```bash
cloudflared tunnel route dns tachtach tachtach.szvtech.org
```

## 5. Install as a systemd service (survives reboots, auto-reconnects)

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared   # should show active (running)
```

## 6. Verify

From any device, anywhere, not on your home WiFi:
```
https://tachtach.szvtech.org/admin
```
Should show the same TachTach admin login as the local `tachtach.local:3000/admin`.

## 7. (Strongly recommended) Add a second login layer

Right now the only thing protecting this from the whole internet is your one
admin password. In the Cloudflare Zero Trust dashboard (dash.cloudflare.com →
Zero Trust → Access → Applications), add an Access application for
`tachtach.szvtech.org` with an email-OTP allow-list (just your own email).
Free for personal use. This adds a login gate *before* traffic ever reaches
the Pi.

## Troubleshooting

- `sudo journalctl -u cloudflared -f` — live tunnel logs
- If DNS doesn't resolve: check the CNAME record was created under
  `szvtech.org` in the Cloudflare dashboard (DNS tab) — `cloudflared tunnel
  route dns` does this automatically, but verify if step 6 fails.
