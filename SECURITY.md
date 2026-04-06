# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in better-model, please report it through [GitHub Security Advisories](https://github.com/talkstream/better-model/security/advisories/new).

Do **not** open a public issue for security vulnerabilities.

## Scope

better-model is a CLI tool that reads and writes `.md` files and YAML frontmatter. It has zero dependencies and does not make network requests, access credentials, or execute arbitrary code.

The primary security surface is the **frontmatter injection** in `audit --fix` and enforcement mode `init` — these modify `.claude/agents/*.md` and `.claude/skills/*/SKILL.md` files.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.4.x   | Yes       |
| < 0.4   | No        |
