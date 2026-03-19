<template>
  <div class="predict-app-shell">
    <a class="predict-return-link" :href="qadrHref">{{ RETURN_TO_QADR_LABEL }}</a>
    <div class="predict-brand-badge">
      <strong>{{ APP_BRAND }}</strong>
      <span>{{ APP_TAGLINE }}</span>
    </div>
    <router-view />
  </div>
</template>

<script setup>
import { APP_BRAND, APP_TAGLINE, RETURN_TO_QADR_LABEL } from './brand'

const qadrHref = typeof window !== 'undefined'
  ? `${window.location.origin}/`
  : 'https://qadr.alefba.dev/'
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  font-family: 'Vazirmatn', 'Tajawal', 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #e5eefb;
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.18), transparent 28%),
    linear-gradient(180deg, #07111d, #0b1524 42%, #0d1727);
  direction: rtl;
}

body {
  background: #08111c;
}

.predict-app-shell {
  min-height: 100vh;
}

.predict-return-link {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 1000;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(9, 15, 26, 0.88);
  color: #f8fbff;
  text-decoration: none;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 20px 50px rgba(2, 8, 23, 0.35);
  backdrop-filter: blur(12px);
}

.predict-return-link:hover {
  background: rgba(15, 23, 42, 0.96);
}

.predict-brand-badge {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 1000;
  display: grid;
  gap: 4px;
  padding: 12px 16px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(7, 12, 22, 0.78);
  box-shadow: 0 24px 60px rgba(2, 8, 23, 0.4);
  backdrop-filter: blur(16px);
}

.predict-brand-badge strong {
  font-size: 14px;
  letter-spacing: 0.08em;
  color: #f8fbff;
}

.predict-brand-badge span {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.84);
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.5);
}

::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.32);
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(191, 219, 254, 0.52);
}

button {
  font-family: inherit;
}
</style>
