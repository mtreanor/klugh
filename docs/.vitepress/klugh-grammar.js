const klughGrammar = {
  name: 'klugh',
  scopeName: 'source.klugh',
  patterns: [
    { include: '#comment' },
    { include: '#block-keyword' },
    { include: '#section-keyword' },
    { include: '#aggregator' },
    { include: '#modifier-keyword' },
    { include: '#operator' },
    { include: '#annotation' },
    { include: '#string' },
    { include: '#variable' },
    { include: '#wildcard' },
    { include: '#number' },
    { include: '#predicate' },
  ],
  repository: {
    comment: {
      name: 'comment.line.double-slash.klugh',
      match: '\\/\\/.*$',
    },
    'block-keyword': {
      // top-level block openers
      name: 'keyword.control.klugh',
      match: '\\b(rule|define|action|world|private)\\b',
    },
    'section-keyword': {
      // action sub-sections and state block keywords
      name: 'storage.type.klugh',
      match: '\\b(preconditions|effects|utility|roles|content)\\b',
    },
    aggregator: {
      // utility aggregator functions
      name: 'support.function.klugh',
      match: '\\b(sum|avg|min|max)\\b',
    },
    'modifier-keyword': {
      // logical and temporal operators written as words
      name: 'keyword.operator.word.klugh',
      match: '\\b(not|then(?:\\[\\d+\\])?)\\b',
    },
    operator: {
      patterns: [
        // fat arrow — must come before bare =
        { name: 'keyword.operator.klugh',            match: '=>' },
        // compound assignment — must come before bare =
        { name: 'keyword.operator.assignment.klugh', match: '[+\\-]=' },
        // comparisons — >= and <= before bare > and <
        { name: 'keyword.operator.comparison.klugh', match: '>=|<=' },
        { name: 'keyword.operator.comparison.klugh', match: '[><]' },
        // conjunction
        { name: 'keyword.operator.logical.klugh',    match: '\\^' },
        // weak negation
        { name: 'keyword.operator.klugh',            match: '~' },
        // strength — @ followed by a digit
        { name: 'keyword.operator.klugh',            match: '@(?=\\s*\\d)' },
        // explicit negation prefix: - before a predicate name or variable
        { name: 'keyword.operator.klugh',            match: '-(?=[a-z?])' },
        // bare assignment =
        { name: 'keyword.operator.assignment.klugh', match: '=' },
      ],
    },
    annotation: {
      // [history], [history: N], [at: N], [importance: N]
      name: 'meta.annotation.klugh',
      begin: '\\[',
      end: '\\]',
      beginCaptures: { '0': { name: 'punctuation.section.annotation.begin.klugh' } },
      endCaptures:   { '0': { name: 'punctuation.section.annotation.end.klugh' } },
      patterns: [
        { include: '#number' },
      ],
    },
    string: {
      // "rule name" and content text: "template ?VAR"
      name: 'string.quoted.double.klugh',
      begin: '"',
      end: '"',
      beginCaptures: { '0': { name: 'punctuation.definition.string.begin.klugh' } },
      endCaptures:   { '0': { name: 'punctuation.definition.string.end.klugh' } },
      patterns: [
        // variables inside content templates are still highlighted
        { name: 'variable.other.klugh', match: '\\?[A-Z][A-Z0-9_]*' },
      ],
    },
    variable: {
      // ?SELF, ?X, ?Y — must be uppercase after ?
      name: 'variable.other.klugh',
      match: '\\?[A-Z][A-Z0-9_]*',
    },
    wildcard: {
      name: 'variable.language.klugh',
      match: '(?<![a-zA-Z0-9])_(?![a-zA-Z0-9])',
    },
    number: {
      name: 'constant.numeric.klugh',
      match: '\\b\\d+(\\.\\d+)?\\b',
    },
    predicate: {
      // identifier immediately before ( — covers knows(?X), friendship(?X), etc.
      // does NOT match entity.pred(...) because the entity name is before ., not (
      name: 'entity.name.function.klugh',
      match: '\\b[a-z][a-zA-Z0-9]*(?=\\s*\\()',
    },
  },
};

export default klughGrammar;
