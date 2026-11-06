# Astro Starter Kit: Minimal

## 外链手册

`/links/` 提供 575 个平台的搜索、分组多标签、笔记、熟悉度与三条一轮的回忆练习。
数据位于 `src/data/external-links.json`，引用 Web.Cafe 网页存档里的 693 条可见推荐理由；
原帖费用、权重和效果描述保留为收集者经验，并未逐条重新核实。
初始分类只覆盖有充分名称或原帖线索的条目，其余显示为待分类。

个人标签、笔记和熟悉度保存在浏览器 localStorage，页面支持 JSON 导入与导出，
完整来源列表保存在 `public/data/external-links.csv`。新设备需要手动导入备份。
纯逻辑检查：`node --experimental-strip-types --test scripts/link-library.test.mjs`。
部署沿用推送 main 后的 GitHub Pages workflow，正式地址为 https://builtbyluna.cc/links/ 。

```sh
npm create astro@latest -- --template minimal
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
