import { mount } from 'svelte';
import './app.css';
import './lib/install.svelte.js';
import App from './App.svelte';
import { nativeStart } from './lib/native.js';
mount(App, { target: document.getElementById('app') });
nativeStart();
