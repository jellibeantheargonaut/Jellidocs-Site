// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	// Custom domain served at the root — no `base` needed.
	site: 'https://jellibean.me',
	integrations: [
		starlight({
			title: 'Jellidocs',
			description: 'Writeups, notes, and tech references.',
			favicon: '/favicon.svg',
			customCss: ['./src/styles/themes.css', './src/styles/custom.css'],
			components: {
				// Custom multi-theme switcher (replaces the Light/Dark/Auto dropdown).
				ThemeProvider: './src/components/ThemeProvider.astro',
				ThemeSelect: './src/components/ThemeSelect.astro',
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/jellibeantheargonaut' },
			],
			// Published site: machine writeups + Prolabs (empty for now).
			sidebar: [
				{ label: 'HackTheBox', items: [{ autogenerate: { directory: 'HackTheBox' } }] },
				{ label: 'Prolabs', items: [{ autogenerate: { directory: 'Prolabs' } }] },
			],
		}),
	],
});
