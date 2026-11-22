import { mount } from 'svelte';
import '@musik/ui/theme.css';
import Popup from './Popup.svelte';

mount(Popup, { target: document.getElementById('app')! });
