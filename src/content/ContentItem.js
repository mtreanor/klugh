export class ContentItem {
  get type() { throw new Error(`${this.constructor.name} must implement type`); }
  render(_binding) { throw new Error(`${this.constructor.name} must implement render(binding)`); }
}
