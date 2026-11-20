import { mount } from 'svelte';
import './app.css';
import './lib/install.svelte.js';
import App from './App.svelte';
mount(App, { target: document.getElementById('app') });
