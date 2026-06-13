import { ContentItem } from './ContentItem.js';

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
      if (value !== null && typeof value === 'object' && 'name' in value) return value.name;
      return String(value);
    });
  }
}
