// Named registry of query handlers — the only place predicates look up sources of truth.
export class QueryHandlers {
  constructor() {
    this.handlers = new Map();
  }

  register(name, handler) {
    this.handlers.set(name, handler);
  }

  getHandler(name) {
    return this.handlers.get(name);
  }
}
