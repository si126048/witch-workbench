import original from '../../snippets/default-snippets.json';
import chinese from '../../snippets/default-snippets.zh.json';
import { interfaceLanguage } from './uiText.js';
import type { SnippetCategory } from '../types';

/** Only bundled learning content is localized; imported/user packs stay untouched. */
export function builtinSnippetCategories(language = interfaceLanguage()): SnippetCategory[] {
  return (language === 'en' ? original : chinese).categories;
}
