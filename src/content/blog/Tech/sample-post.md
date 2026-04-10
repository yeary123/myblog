---
title: Sample post in tech
pubDate: 2026-03-20
description: Demonstrates folder-based routing, syntax highlighting, and typography defaults.
---

This file lives at `src/content/blog/tech/sample-post.md`, so its URL is `/blog/tech/sample-post`. The first path segment (`tech`) is the **category** derived from the folder layout.

## Code

```ts
export function greet(name: string) {
	return `Hello, ${name}`;
}
```

## Lists

- Folder names map to categories automatically.
- `getStaticPaths` preserves nested paths in the slug.
