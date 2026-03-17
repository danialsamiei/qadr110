import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { APP_BRAND } from './brand'
import { installPersianUiLocalization } from './localize-ui'

document.documentElement.lang = 'fa'
document.documentElement.dir = 'rtl'
document.title = APP_BRAND

const app = createApp(App)

app.use(router)

app.mount('#app')

installPersianUiLocalization(document.body)
