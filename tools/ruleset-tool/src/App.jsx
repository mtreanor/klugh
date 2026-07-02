import React, { useEffect, useMemo, useRef, useState } from 'react';
import InspectTab from './components/InspectTab.jsx';
import AddRuleTab from './components/AddRuleTab.jsx';
import PredicateSidebar from './components/PredicateSidebar.jsx';
import { InsertContext } from './InsertContext.js';
import { compileGrammar } from './tmHighlight.js';
import { api } from './api.js';

export default function App() {
  const [scenarios, setScenarios] = useState([]);
  const [scenario, setScenario] = useState('');
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('inspect');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [highlighter, setHighlighter] = useState(null);

  // Insert-target registry for the predicate sidebar (see InsertContext).
  const inserterRef = useRef(null);
  const insertApi = useMemo(() => ({
    register: (fn) => { inserterRef.current = fn; },
    clear: (fn) => { if (inserterRef.current === fn) inserterRef.current = null; },
    insert: (template, shift) => inserterRef.current?.(template, shift),
  }), []);

  useEffect(() => {
    api.grammar().then(g => setHighlighter(compileGrammar(g))).catch(() => {});
  }, []);

  useEffect(() => {
    api.scenarios().then(list => {
      setScenarios(list);
      const withRules = list.find(s => s.rulesets.length > 0) ?? list[0];
      if (withRules) setScenario(withRules.name);
    }).catch(e => setError(e.message));
  }, []);

  async function reload(name = scenario) {
    if (!name) return;
    setLoading(true);
    try {
      setData(await api.scenario(name));
      setError(null);
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(scenario); }, [scenario]);

  return (
    <InsertContext.Provider value={insertApi}>
      <div className="app">
        <header className="topbar">
          <h1>klugh · ruleset-tool</h1>
          <label className="scenario-pick">
            Scenario
            <select value={scenario} onChange={e => setScenario(e.target.value)}>
              {(scenarios ?? []).map(s => (
                <option key={s.name} value={s.name} disabled={!s.hasPredicates}>
                  {s.name}{s.active ? ' (active)' : ''}{s.rulesets.length === 0 ? ' — no rulesets' : ''}
                </option>
              ))}
            </select>
          </label>
          <nav className="tabs">
            <button className={tab === 'inspect' ? 'active' : ''} onClick={() => setTab('inspect')}>Inspect</button>
            <button className={tab === 'add' ? 'active' : ''} onClick={() => setTab('add')}>Add rule</button>
          </nav>
        </header>

        {error && <div className="banner error global">{error}</div>}

        <div className="layout">
          <PredicateSidebar predicates={data?.predicates ?? []} />
          <main className="content">
            {!data && !error && <div className="empty">Loading…</div>}
            {data && tab === 'inspect' && (
              <InspectTab scenario={scenario} data={data} highlighter={highlighter} onChanged={() => reload()} />
            )}
            {data && tab === 'add' && (
              <AddRuleTab
                scenario={scenario} data={data}
                onChanged={() => reload()}
                onExit={() => setTab('inspect')}
              />
            )}
          </main>
        </div>
      </div>
    </InsertContext.Provider>
  );
}
