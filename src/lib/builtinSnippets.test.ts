import { builtinSnippetCategories } from './builtinSnippets';

it('localizes the bundled descriptions while preserving every code example', () => {
  const en = builtinSnippetCategories('en');
  const zh = builtinSnippetCategories('zh-CN');
  expect(zh[0].name).toBe('对白与旁白');
  expect(en[0].name).toBe('Dialogue & Narration');
  expect(zh.flatMap(category => category.snippets.map(snippet => snippet.code)))
    .toEqual(en.flatMap(category => category.snippets.map(snippet => snippet.code)));
});
