// The two implicit variables available inside an action definition.
//
//   ?this_action     — the action being defined/scored, bound to its `action`
//                       entity. Available everywhere a binding works: info,
//                       preconditions, utility, and effects. Never enumerated.
//   ?this_occurrence — the reified occurrence of the action. Bound only while
//                       applying effects, and only when occurrence recording is
//                       active for that execution. Effects that reference it are
//                       skipped when no occurrence was recorded; it is a
//                       load-time error to use it anywhere but effects.
export const THIS_ACTION     = 'this_action';
export const THIS_OCCURRENCE = 'this_occurrence';
