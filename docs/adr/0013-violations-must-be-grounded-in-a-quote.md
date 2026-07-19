# ADR-0013: Violations must be grounded in a verbatim quote

**Status:** Accepted
**Date:** 2026-07-19

## Context

`violations` was a list of free-text strings from the model. In practice the model filled it with
statements about the **absence** of problems: "none", "-", "No obvious factual violations against
the brief". Because `flagged` is derived from `violations.length > 0` (ADR-0007), nearly every post
was flagged and the indicator stopped carrying information.

## Decision

A violation is `{ quote, issue }`, where `quote` is a verbatim fragment of the post. Code verifies
the quote against the post text (`groundViolations`) and drops anything that cannot be found.
Rule-based violations are grounded by construction — their quote is the matched word.

The model no longer emits a top-level summary list; the final list is assembled in code.

## Alternatives considered

- **Prompt instruction "return an empty array".** Tried and kept as a second line of defence, but a
  weak default model (`gpt-5-nano`) ignores it often enough to be useless alone.
- **Blocklist of filler phrases.** Rejected: a genuine finding is frequently phrased as a negation
  ("no source for the 40% figure") and would be discarded together with the noise.

## Consequences

- The reviewer schema is stricter and the prompt is longer.
- A short numeric quote needed an explicit exception — a length floor alone discarded `40%`, which
  is exactly the class of fabricated claim fact-checking exists to catch.
- Quantity of reported violations dropped sharply. This is the intended outcome, and it is why
  grounding statistics are logged: silently dropping everything and genuinely finding nothing look
  identical from the outside.

## Enforcement

`groundViolations` in `packages/pipeline/src/agents/reviewer.ts`, covered by unit tests including
the negation case. Every review logs `claimed` vs `grounded` counts so a systematic drop in
grounding is visible rather than silent.
