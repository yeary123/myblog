import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const BLOG_DIR = join(process.cwd(), 'src/content/blog');

/**
 * Lists unique top-level directory names under `src/content/blog`.
 * Used for category navigation and archive routes.
 */
export function getTopLevelBlogCategorySlugs(): string[] {
	try {
		return readdirSync(BLOG_DIR, { withFileTypes: true })
			.filter((d) => d.isDirectory() && !d.name.startsWith('.'))
			.map((d) => d.name)
			.sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
}
