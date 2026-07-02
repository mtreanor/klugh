# action-rule-set-tool

`tools/action-rule-set-tool` is a local web app for inspecting, searching, and editing rulesets. Run it with:

```
cd tools/action-rule-set-tool
npm install
npm run dev
```

It reads scenarios from a `project.config.json` and edits the rule files that config points at, in place.

---

## Pointing it at the right config

The tool resolves its `project.config.json` in this order:

1. **`KLUGH_CONFIG`** — an explicit override. Set it to a `project.config.json` path (or a directory containing one):

   ```
   KLUGH_CONFIG=/path/to/project.config.json npm run dev
   ```

   To set it once without retyping, create a gitignored `tools/action-rule-set-tool/.env` containing `KLUGH_CONFIG=/abs/path/to/project.config.json`.

2. **The host repo's config**, auto-discovered when klugh is a **git submodule**. Put a `project.config.json` at your repo root and the tool finds it — no configuration needed.

3. **klugh's own `project.config.json`** at the repo root (standalone development).

Scenario paths inside the config are resolved **relative to the config file's own directory**, so your config and data can live together anywhere — including a parent repo that vendors klugh as a submodule. The engine and syntax-highlighting grammar always load from the klugh submodule, so nothing about klugh needs editing.

The server prints the resolved config path on startup, so you can confirm which one is in use.
