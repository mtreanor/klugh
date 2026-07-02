import { createContext, useContext } from 'react';

// Lets the predicate sidebar insert into whichever DSL field was last focused.
// A DslInput registers its inserter (a function of (template, shiftKey)); the
// sidebar calls `insert(template, shiftKey)`, which delegates to the current one.
export const InsertContext = createContext(null);

export function useInsert() {
  return useContext(InsertContext);
}
