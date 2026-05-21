# Blockchain profile

> A **profile** in better-model is an opt-in domain-specific keyword overlay applied on top of the base routing rules. It is *additive only* — it never demotes an agent's tier, only catches agents the base keyword set would route to default Sonnet.

A convenience preset for projects whose codebase is smart-contract heavy. Covers two ecosystems in one profile:

- **EVM family** — Solidity, EVM bytecode, audit tooling (Slither, Mythril)
- **TON family** — FunC, Tact, Fift, TLB schemas, Jetton standard

## Activate

```bash
npx better-model init --profile blockchain
```

The profile is encoded inside the routing block in `CLAUDE.md` as a metadata comment (`<!-- better-model profile: blockchain -->`). On future `init` runs (without `--profile`) it is preserved automatically.

## What it changes

The blockchain profile **adds** keywords to the inference engine's Tier 3 xhigh tier. The base rules (Tier 1 Haiku, Tier 3 max, Tier 3 xhigh base, Tier 2 Sonnet) are unchanged — the profile only catches agents the base keyword set would route to default Sonnet.

| Keyword | Match style | Why |
|---|---|---|
| `solidity` | substring | distinctive vocabulary, no general-English collisions |
| `evm` | substring | three-letter acronym, near-zero ambiguity |
| `slither` | substring | static-analysis tool name, distinctive |
| `mythril` | substring | symbolic-execution tool name, distinctive |
| `toncoin` | substring | TON ecosystem token, distinctive |
| `jetton` | substring | TON fungible-token standard, distinctive |
| `tlb` | substring | TON type-language binding schema, three-letter acronym |
| `func` | word boundary | avoids matching `function`, `functional`, etc. |
| `tact` | word boundary | avoids matching `tactic`, `tactical`, `contact`, etc. |
| `fift` | word boundary | avoids matching `fifth`, `fifty`, etc. |
| `contract` | word boundary | avoids matching `contractual`, `subcontract`, etc. |

`auditor` is intentionally omitted from this list — it is already covered by the base `audit` keyword (Tier 3 xhigh) and would never trigger as a profile match.

## What this profile is NOT

- **It is not an efficacy claim.** We don't yet have field data measuring Sonnet vs Opus performance on Solidity / FunC / Tact specifically. When such data exists, this file will be updated with measurements; until then the profile is an opinionated default, not an evidence-backed recommendation.
- **It is not exclusive.** All non-blockchain agents in the same project still route through the base inference rules. An `architect-system` agent still goes to Opus max regardless of profile.
- **It is not destructive.** The profile is additive: it never demotes an agent's tier (an additivity invariant test enforces this in CI).

## Evidence base (such as it is)

| Source | What it shows | Reliability |
|---|---|---|
| [SolidityBench, IQ.ai](https://blog.iqai.com/soliditybench-by-iq-the-first-leaderboard-for-evaluating-llm-solidity-code-generation/) | Solidity-specific LLM eval exists; community treats it as a distinct domain | Medium |
| [CryptoBench arXiv:2512.00417](https://arxiv.org/pdf/2512.00417) | Crypto/blockchain agentic workflows benchmarked end-to-end | Medium |
| [SWE-bench Multilingual](https://www.swebench.com/multilingual.html) | 30-pt language spread on Claude 3.7 Sonnet across 9 languages — domain matters | High |
| Our field data | Workflow pattern (code-review loops) drives more variance than language domain in current sample | Low confidence (n=1 outlier project) |

The honest read: there is **circumstantial evidence** that domain-specific routing helps, and **no head-to-head measurement** that says it helps for Solidity / FunC / Tact specifically. Ship-level decision: provide the profile as a convenience for users who already know they want Opus on their contract work; don't promise efficiency gains we can't measure yet.

## How to propose updates

To add a keyword, remove one, or change the tier mapping, [open an issue](https://github.com/talkstream/better-model/issues) with: (1) the proposed change, (2) at least one published benchmark or reproducible measurement supporting it, (3) a false-positive check (does the keyword substring-match common English / general code?). See [CONTRIBUTING.md](../../CONTRIBUTING.md#profiles) for the full review criteria.

## Opt out

Remove the profile marker from `CLAUDE.md` (the block between `<!-- better-model:start -->` and `<!-- better-model:end -->`). On next `init`, the profile-less block will be regenerated and no profile-overlay keywords will activate.

Alternatively: a user who prefers Sonnet on their contracts can add a one-line override to their global `~/.claude/CLAUDE.md`:

```
Agent() calls with subagent_type=solidity-coder — model: "sonnet", effort: "high"
```

The `stats` command surfaces deviations from the profile expectation transparently — see the `dev` column in default `stats` output.
