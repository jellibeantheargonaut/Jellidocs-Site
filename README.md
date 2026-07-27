# Jellidocs

My HackTheBox machine writeups and Pro Lab notes, published at
[jellibean.me](https://jellibean.me).

Built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build),
featuring a custom glassmorphism theme switcher (Midnight / Forest).

## Development

```sh
npm install
npm run dev        # local dev server at http://localhost:4321
npm run build      # production build to ./dist/
npm run preview    # preview the production build
```

## Structure

```
src/
├─ content/docs/          # writeups (Markdown)
│  ├─ HackTheBox/         # machine writeups
│  └─ Prolabs/            # Pro Lab writeups (WIP)
├─ components/            # custom theme switcher
└─ styles/                # theme + layout CSS
astro.config.mjs          # site + sidebar config
```

## Deployment

Pushes to `main` are built and deployed to GitHub Pages via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml), served on the
custom domain in [public/CNAME](public/CNAME).
