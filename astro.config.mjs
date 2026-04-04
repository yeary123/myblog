// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

const [ghOwner, ghRepo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const onGithubActions = process.env.GITHUB_ACTIONS === 'true';

/** Treat unset GitHub Actions `vars.*` (empty string) as missing.
 * @param {string} name */
function envOptional(name) {
  const v = process.env[name];
  return v === undefined || v === '' ? undefined : v;
}

/**
 * Canonical `site` origin (meta, RSS, sitemap). Must match where the built files are actually served.
 * On GitHub Actions this is taken from GITHUB_REPOSITORY. Override anytime with PUBLIC_SITE_URL
 * (e.g. after you add a real custom domain in repo Settings → Pages).
 */
const PRODUCTION_SITE = 'https://yeary123.github.io';

/**
 * Default base for github.io project pages: /repo/. Custom domains are always served at the host
 * root, so set ASTRO_BASE_PATH=/ in CI (or locally) when using a custom domain.
 */
function githubPagesBase() {
  if (!ghOwner || !ghRepo) return undefined;
  if (ghRepo.toLowerCase() === `${ghOwner.toLowerCase()}.github.io`) return '/';
  return `/${ghRepo}/`;
}

const base =
  envOptional('ASTRO_BASE_PATH') ??
  (onGithubActions ? githubPagesBase() : undefined) ??
  '/';

const site =
  envOptional('PUBLIC_SITE_URL') ??
  (onGithubActions && ghOwner ? `https://${ghOwner}.github.io` : PRODUCTION_SITE);

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