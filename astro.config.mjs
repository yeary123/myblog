// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

const [ghOwner, ghRepo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const onGithubActions = process.env.GITHUB_ACTIONS === 'true';

/** Canonical site URL (meta, RSS, sitemap). Override with PUBLIC_SITE_URL. */
const PRODUCTION_SITE = 'https://builtbyluna.github.io';

/** User site (username.github.io repo) is served at domain root; project repos use /repo/ base. */
function githubPagesBase() {
  if (!ghOwner || !ghRepo) return undefined;
  if (ghRepo.toLowerCase() === `${ghOwner.toLowerCase()}.github.io`) return '/';
  return `/${ghRepo}/`;
}

const base =
  process.env.ASTRO_BASE_PATH ??
  (onGithubActions ? githubPagesBase() : undefined) ??
  '/';

const site = process.env.PUBLIC_SITE_URL ?? PRODUCTION_SITE;

// https://astro.build/config
export default defineConfig({
  site,
  base,
  output: 'static',

  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [react(), mdx()]
});