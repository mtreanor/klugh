# Quickstart

A tiered path into klugh. Each tier is self-contained and runnable, and they build on one another:

| Tier | Page | You'll learn |
|------|------|--------------|
| **1** | [Worlds & queries](./worlds-and-queries) | Author a world, load it, query it, change it by hand |
| **1.5** | [Provenance](./provenance) | Ask *why* any fact is true |
| **2** | [Actions](./actions) | Author choices, score them by utility, run the best one |
| **2.5** | [Action records](./action-records) | Read back what happened and what caused it |
| **3** | [Plans](./plans) | Reach a declared goal with a sequence of actions |

Tier 1 is meant to be effortless. Tier 2 (actions) is a small step up. Tier 3 (plans) is where you compose the engine into something larger.

Everything here goes through the **`Engine`** — klugh's single entry point. You create one, then call `query`, `assert`, `selectAction`, `execute`, `plan`, `why`, and so on. You rarely need anything else.

## The scenario

Every page on this path uses the same small world, which lives in [`data/quickstart/`](https://github.com/mtreanor/klugh). Three agents — `alice`, `bob`, `carol` — with:

- **`knows`** — a *directional* acquaintance relation (alice knows bob, but not carol)
- **`trusts`** — boolean, supporting explicit disbelief (`-trusts`)
- **`friendship`** — a numeric relation (0–100) with `cold` / `neutral` / `warm` tiers
- **`hasNeed`** — who currently needs help
- **`helped`**, **`rested`** — outcomes actions produce

It's deliberately tiny — small enough to hold in your head, rich enough to show queries, numeric tiers, negation, utility-scored actions, and a two-step plan.

Start with [Worlds & queries →](./worlds-and-queries)
