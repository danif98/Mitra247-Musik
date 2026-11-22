import { mount } from 'svelte';
import '@musik/ui/theme.css';
import App from './src/App.svelte';
import { registerServiceWorker } from './register-sw';

mount(App, { target: document.getElementById('app')! });
registerServiceWorker('./sw.js', './');
