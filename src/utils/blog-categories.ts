import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { slug as githubSlug } from 'github-slugger';

const BLOG_DIR = join(process.cwd(), 'src/content/blog');

export type BlogCategoryNav = {
	/** Matches the first segment of `post.id` (Astro content glob uses github-slugger per path segment). */
	slug: string;
	/** Original folder name on disk, for display. */
	label: string;
};

/**
 * Top-level folders under `src/content/blog`, with slugs aligned to Astro collection entry ids.
 */
export function getTopLevelBlogCategories(): BlogCategoryNav[] {
	try {
		return readdirSync(BLOG_DIR, { withFileTypes: true })
			.filter((d) => d.isDirectory() && !d.name.startsWith('.'))
			.map((d) => ({ slug: githubSlug(d.name), label: d.name }))
			.sort((a, b) => a.slug.localeCompare(b.slug));
	} catch {
		return [];
	}
}

export function getTopLevelBlogCategorySlugs(): string[] {
	return getTopLevelBlogCategories().map((c) => c.slug);
}
