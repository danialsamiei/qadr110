<template>
  <div class="predict-app-shell">
    <a class="predict-return-link" :href="qadrHref">بازگشت به QADR110</a>
    <router-view />
  </div>
</template>

<script setup>
const qadrHref = typeof window !== 'undefined' && window.location.pathname.startsWith('/predict')
  ? '/'
  : 'https://qadr.alefba.dev/'
</script>

<style>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  font-family: 'JetBrains Mono', 'Space Grotesk', 'Noto Sans SC', monospace;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #000000;
  background-color: #ffffff;
}

body {
  background: #ffffff;
}

.predict-app-shell {
  min-height: 100vh;
}

.predict-return-link {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 1000;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.92);
  color: #111827;
  text-decoration: none;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(12px);
}

.predict-return-link:hover {
  background: #ffffff;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
}

::-webkit-scrollbar-thumb {
  background: #000000;
}

::-webkit-scrollbar-thumb:hover {
  background: #333333;
}

/* 全局按钮样式 */
button {
  font-family: inherit;
}
</style>
