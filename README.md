# Astro Starter Kit: Minimal

## 外链手册

`/links/` 提供 575 个平台的搜索、自定义标签、笔记、熟悉度与三条一轮的回忆练习。
数据位于 `src/data/external-links.json`，引用 Web.Cafe 网页存档里的 693 条可见推荐理由；
原帖费用、权重和效果描述保留为收集者经验，并未逐条重新核实。
标签只保留用户自行添加的内容，无预设标签或分组。卡片中输入名称即可添加标签，
也可选择已创建的标签；点击标签查看同类外链，点击 × 移除卡片标签或删除全局标签。
旧版浏览器记录和备份会自动移除预设标签，保留用户自建标签、关联、笔记及熟悉度。
评论默认展开，点击“评论”可收起或展开。

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
