import type { CollectionEntry } from 'astro:content';

export type BlogEntry = CollectionEntry<'blog'>;

export function getTopLevelCategoryFromId(postId: string): string {
	return postId.split('/')[0] ?? postId;
}

export function sortPostsByDateDesc(posts: BlogEntry[]): BlogEntry[] {
	return [...posts].sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function postsInCategory(posts: BlogEntry[], category: string): BlogEntry[] {
	const key = category.toLowerCase();
	return sortPostsByDateDesc(
		posts.filter((p) => getTopLevelCategoryFromId(p.id).toLowerCase() === key),
	);
}
