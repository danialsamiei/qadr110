# راهنمای استقرار QADR110 روی qadr.alefba.dev

## 1) پیش‌نیاز
- سرور Ubuntu با Docker/Node
- cloudflared tunnel فعال
- دسترسی DNS در Cloudflare

## 2) اجرای سرویس
```bash
npm ci
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

## 3) Cloudflared ingress
```yaml
ingress:
  - hostname: qadr.alefba.dev
    service: http://localhost:4173
  - service: http_status:404
```

## 4) سخت‌سازی امنیت
- فعال‌سازی Cloudflare Access
- محدودسازی IP در لایه origin
- روتیشن دوره‌ای API Keyها
- غیرفعال‌سازی دسترسی مستقیم پورت‌های داخلی

## 5) مانیتورینگ
- Grafana/Prometheus برای health و latency
- Alert بر اساس خطای upstream و نرخ timeout
