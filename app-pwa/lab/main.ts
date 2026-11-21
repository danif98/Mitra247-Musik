import { mount } from 'svelte';
import '@musik/ui/theme.css';
import Lab from './Lab.svelte';
import { registerServiceWorker } from '../register-sw';

mount(Lab, { target: document.getElementById('app')! });
registerServiceWorker('../sw.js', '../');
