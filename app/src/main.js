import { mount } from 'svelte';
import './app.css';
import './lib/install.svelte.js';
import App from './App.svelte';
// an invite link (…/wfd/#join=ABC123): remember the code through sign-in, then clean the address bar
{ const m = location.hash.match(/^#join=([A-Za-z0-9-]{4,20})/); if (m) { try { localStorage.setItem('wfd-join', m[1]); } catch {} history.replaceState(null, '', location.pathname); } }
import { nativeStart } from './lib/native.js';
mount(App, { target: document.getElementById('app') });
nativeStart();
