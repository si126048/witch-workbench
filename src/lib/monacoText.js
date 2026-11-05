// Messages shipped by monaco-editor 0.45.0 (Microsoft, MIT License).
// Keep this catalog paired with Monaco when upgrading the editor dependency.
import zh from './monaco.zh.json' with { type: 'json' };
import { interfaceLanguage } from './uiText.js';

export function monacoText(message) {
  return interfaceLanguage() === 'en' ? message : (zh[message] ?? message);
}
