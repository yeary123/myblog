import type { Handbook, HandbookEntry } from '../lib/handbooks.ts';

export const handbooks: Handbook[] = [{
  id: 'multilingual-article-promotion',
  title: '多语言文章推广',
  description: '整理英语、日语和中文文章发布平台，以及所提供资料中的发布建议、收录方法和常见问题。内容来自一份标注「10 月 31 日更新」的经验分享，年份未注明，具体操作条件以各平台现行规则为准。',
  sections: [
    { id: 'english', title: '英语平台' },
    { id: 'japanese', title: '日语平台' },
    { id: 'chinese', title: '中文平台' },
    { id: 'indexing', title: '提高文章被收录的概率', paragraphs: [
      '原文建议参与同平台的相关讨论，多与他人互动；相关内容之间可以自然互相引用，也可以在自己的网站上链接第三方平台的个人文章列表。',
      '原文同时建议尝试不同类型的文章，并持续提高内容质量。以上均为经验分享，不代表平台承诺或收录保证。',
    ] },
    { id: 'questions', title: '常见问题', paragraphs: [
      '文章阅读数为 0 怎么办？原文建议继续提高文章质量，并关注文章是否被收录。',
      '账号被封了怎么办？原文提到可以向平台申请解封。',
    ] },
  ],
}];

const descriptions: [string, string, string][] = [
  ['english', 'link-0f63a2a5a562', '原文建议先熟悉 Hacker News 的规则并正常参与点赞、评论，不要注册后立即发布推广文章；原文举例一周后再发。'],
  ['english', 'link-97c89f9e5f1b', '原文将 Reddit 列为推荐的英语平台，未补充具体操作步骤。'],
  ['english', 'link-09a8b930c8b7', '原文建议创建项目仓库，在 README 中介绍网站并加入链接，完善仓库右侧的网址和相关 Topics。'],
  ['english', 'link-28e74c8168d0', '原文建议新账号第一天先不填写 Profile 网址，首篇文章先不添加链接；遇到封号时可尝试申诉。这是原作者的经验，不代表固定的平台规则。'],
  ['english', 'link-a6f7d6026320', '原文说明注册后会获得二级域名，后续发布的文章显示在该域名下。'],
  ['english', 'link-a3de915cfc62', '原文将 Hashnode 列为博客平台，并提到了文章被删除的问题。'],
  ['english', 'link-206cc24ad041', '原文建议在 Short bio 中填写域名，将相关文章整理到 List 中，并正常参与相关讨论。\n原文还提到账号页和文章页可能分别出现 noindex，检查结果可能随时间变化；原作者使用 Google 富媒体搜索结果测试观察当时的抓取情况，并认为购买订阅不能解决 noindex 问题。'],
  ['english', 'link-6a5a9b3e8bb0', '原文将 Blogger 列为 Google 的博客平台，并提到了搭建博客和配置 GSC 的相关教程。Blogger 和 Blogspot 是同一平台的相关入口，本手册统一关联外链库中的 Blogger 记录。'],
  ['japanese', 'link-d9a4cef52f78', '原文将 Qiita 列为推荐的日语文章发布平台。'],
  ['japanese', 'link-4bc9972d665f', '原文将 note 列为推荐的日语平台，并提到无法注册时曾尝试更换 IP 地址。'],
  ['japanese', 'link-cd61dc888ab3', '原文将 Zenn 列为推荐的日语文章发布平台。'],
  ['chinese', 'link-67c005a20511', '原文将 CSDN 列为推荐的中文文章发布平台。'],
  ['chinese', 'link-69ca45207949', '原文将 V2EX 列为推荐的中文论坛。'],
  ['chinese', 'link-240be83916c6', '原文将 linux.do 列为推荐的中文论坛。'],
];

export const handbookEntries: HandbookEntry[] = descriptions.map(([sectionId, entryId, description]) => ({
  handbookId: handbooks[0].id, sectionId, entryId, description,
}));
