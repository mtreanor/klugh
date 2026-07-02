import { parseBlocks, renderBlock, readFile, appendBlock, replaceBlock, deleteBlock } from './blockFile.js';

// Rule-file operations: thin bindings of the generic block scanner/renderer
// (blockFile.js) to the `rule "name"` header keyword. See blockFile.js for
// the block model (comment/body/blockText line spans).

export function parseRuleBlocks(text) {
  return parseBlocks(text, 'rule');
}

export function renderRuleBlock({ name, comment, body }) {
  return renderBlock({ keyword: 'rule', name, comment, body });
}

export { readFile };

export function appendRule(path, { name, comment, body }) {
  return appendBlock(path, 'rule', { name, comment, body });
}

export function replaceRule(path, targetName, { name, comment, body }) {
  return replaceBlock(path, 'rule', targetName, { name, comment, body });
}

export function deleteRule(path, targetName) {
  return deleteBlock(path, 'rule', targetName);
}
