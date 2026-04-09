# Skills Arena Research

This note is a clean reference for the **Moltbook agent-track Skills Arena** and how it differs from the product-oriented `X Layer Arena`.

## Sources

- [OKX Build X Hackathon agent page](https://web3.okx.com/de/xlayer/build-x-hackathon)
- [OKX agent-track skill](https://raw.githubusercontent.com/okx/plugin-store/main/skills/okx-buildx-hackathon-agent-track/SKILL.md)
- [OKX agent-track repo README](https://github.com/okx/plugin-store/tree/main/skills/okx-buildx-hackathon-agent-track)

## What Skills Arena Is

Official FAQ framing:

- `X Layer Arena` is for a complete onchain application
- `Skills Arena` is for building reusable skills

That means the submission unit is not mainly a full app or a public product shell. The submission unit is a **capability that other agents can call and reuse**.

Good examples of Skills Arena shapes:

- a route-planning skill
- a trade-execution skill
- a portfolio-risk skill
- an onchain data interpretation skill
- an agent payment / settlement skill

## Prize Structure

From the official agent-track page:

- 1st: `2,000 USDT`
- 2nd: `1,200 USDT x2`
- 3rd: `600 USDT x3`
- special prizes:
  - `Best Uniswap integration`
  - `Most popular`

Important inconsistency:

- the agent page currently shows special prizes as `500 USDT`
- the agent-track GitHub README shows special prizes as `400 USDT`

Treat the exact special-prize amount as **officially inconsistent across OKX-owned pages** until clarified by OKX staff.

## Judging Signals

The agent page and skill materials imply that Skills Arena still cares about:

- integration depth with `Onchain OS` or `Uniswap AI skills`
- practical usefulness for agents
- reusability
- public demo / social visibility on Moltbook and X

Because the FAQ says Skills Arena is for technical edge, the strongest submissions are likely to show:

1. a clearly bounded skill
2. a clean invocation model
3. useful outputs that can drive downstream agent action
4. strong integration with official skill surfaces

## Requirements And Constraints

From the official materials:

- use at least one core module from `Onchain OS skills` or `Uniswap skills`
- submit through the hackathon flow on Moltbook / `m/buildx`
- public GitHub repo and README are still expected
- Skills Arena projects are `recommended` to be built in the X Layer ecosystem as well

The official FAQ is looser here than X Layer Arena:

- `X Layer Arena`: at least one part needs to be deployed on X Layer
- `Skills Arena`: X Layer ecosystem alignment is recommended, not phrased as equally mandatory in the FAQ

Still, if the skill is not obviously useful on X Layer, it will likely score worse.

## What A Strong Skills Arena Submission Looks Like

The strongest skill entry should answer this sentence cleanly:

`Any agent can call this skill to do X on X Layer better than before.`

A weak Skills Arena entry:

- is just a thin wrapper around an API
- only works inside one custom app
- has no clear input/output contract
- has no public examples or proof of use

A strong Skills Arena entry:

- exposes a crisp capability boundary
- has a simple invocation model
- produces outputs an agent can act on
- is easy to demonstrate in isolation
- has examples of real agent usage

## Best Fit Directions

For this hackathon, the most plausible high-upside skill directions are:

1. `Execution skill`
   - route, approve, swap, and return tx proof
   - strongest if tied to Onchain OS wallet + DEX

2. `Decision skill`
   - interpret onchain data, market state, or signals into structured action recommendations
   - strongest if agents can chain it into execution

3. `Risk skill`
   - measure position risk, drawdown risk, or wallet health
   - strongest if it helps agents avoid bad execution

4. `Uniswap-native skill`
   - directly targets the `Best Uniswap integration` special prize
   - likely the cleanest route if choosing Skills Arena on purpose

## What This Means For Agent Fight Club

`Agent Fight Club` itself is not a natural Skills Arena project.

Why:

- it is a complete product
- it has a league UI and social loop
- its core value is product composition, not one reusable capability

If anything from Fight Club is later spun out for Skills Arena, the best candidates would be:

- a `decision lineage skill`
- a `battle scoring skill`
- a `fighter execution proof skill`

Those would need to be extracted and framed so that other agents can use them outside the Fight Club app.

## Practical Takeaway

For now:

- `Agent Fight Club` should stay in `X Layer Arena`
- `Skills Arena` should be treated as a separate project opportunity

If you want to enter Skills Arena seriously, build a **single reusable capability**, not another full product shell.
