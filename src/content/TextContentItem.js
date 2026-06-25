import { ContentItem } from './ContentItem.js';
import { toFactArg } from '../entityValue.js';

export class TextContentItem extends ContentItem {
  constructor(template) {
    super();
    this.template = template;
  }

  get type() { return 'text'; }

  render(binding) {
    return this.template.replace(/\?([A-Z][A-Z0-9_]*)/g, (match, name) => {
      const value = binding.assignments.get(name);
      if (value === undefined) return match;
      return String(toFactArg(value));
    });
  }
}
