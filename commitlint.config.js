// Commit message rules — the machine-checked half of CONTRIBUTING.md.
//
// A convention that is only written down decays; this file is what makes it hold. The types and
// scopes below are exactly the ones documented in CONTRIBUTING.md — if you add one there, add it
// here too, otherwise the document and the hook drift apart.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "perf", "refactor", "test", "docs", "chore", "build", "ci", "revert"],
    ],

    // Scope: a package/app, or a feature name when the change deliberately spans several packages
    // (that is how `notifications`, `export` and `runs` are used in the existing history).
    "scope-enum": [
      2,
      "always",
      [
        // packages and apps
        "web",
        "api",
        "worker",
        "pipeline",
        "db",
        "shared",
        "evaluators",
        "infra",
        // cross-cutting feature scopes
        "runs",
        "content",
        "reviewer",
        "notifications",
        "export",
        "planner",
        "onboarding",
        "auth",
      ],
    ],
    "scope-empty": [0], // optional: repo-wide changes carry no scope

    // Subject style: imperative, lowercase, no trailing period.
    //
    // WARNING, not error, and that is deliberate. Case rules assume Latin prose, and our subjects
    // legitimately begin with acronyms: "RLS-політики", "NULLIF у RLS", "ADR-записи", "CLAUDE.md".
    // As an error this rule rejected 5 of the first 38 commits — all of them correctly written.
    // A rule that blocks valid work is worse than no rule; as a warning it still nudges away from
    // "Додав ендпоінт" without standing in the way.
    "subject-case": [1, "never", ["upper-case", "pascal-case", "start-case", "sentence-case"]],
    "subject-full-stop": [2, "never", "."],

    // Cyrillic subjects run longer than English ones; 72 is a floor for readability in `git log`,
    // not a hard style rule, so this is a warning rather than an error.
    "header-max-length": [1, "always", 72],

    // The body is where the *why* lives (CONTRIBUTING.md). Not enforced as required — a one-line
    // chore does not need one — but formatting is checked so bodies stay readable.
    "body-leading-blank": [2, "always"],
    "body-max-line-length": [1, "always", 100],
    "footer-leading-blank": [2, "always"],
  },
};
