import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './styles/panelControls.css';

const app = createApp(App);

app.use(createPinia());

app.mount('#app');

if (typeof window !== 'undefined') {
	window.dispatchEvent(new CustomEvent('dashboard:mounted', { detail: Date.now() }));
	window.__hideDashboardLoading?.();
}
