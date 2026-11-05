import { uiText } from './uiText.js';
import zh from './uiText.zh.json';

describe('shared Chinese interface catalog', () => {
  afterEach(() => { document.documentElement.lang = 'en'; });

  it('uses Chinese for the shipping locale and preserves the English fallback', () => {
    document.documentElement.lang = 'zh-CN';
    expect(uiText('Settings')).toBe('设置');
    expect(uiText('Settings', {}, 'en')).toBe('Settings');
    expect(uiText('A new message')).toBe('A new message');
  });

  it('does not translate or re-interpret user-supplied values', () => {
    expect(uiText('Open {value0}', { value0: 'Story $& {value1}' }, 'zh')).toBe('打开 Story $& {value1}');
    expect(uiText('Wrap the selected text in {color=…}{/color} tags', {}, 'zh')).toContain('{color=…}{/color}');
  });

  it('never introduces an interpolation placeholder absent from the source', () => {
    for (const [source, translated] of Object.entries(zh)) {
      expect(translated.trim(), source).not.toBe('');
      const allowed = new Set(source.match(/\{value\d+\}/g) ?? []);
      for (const placeholder of translated.match(/\{value\d+\}/g) ?? []) {
        expect(allowed.has(placeholder), `${source}: ${placeholder}`).toBe(true);
      }
    }
  });
});
