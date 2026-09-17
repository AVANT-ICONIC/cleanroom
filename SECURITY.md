# Security

Green Room is a local repository-analysis CLI. It reads source files, Git history, and its own policy files. It does not require network access at runtime after installation.

## Trust boundary

The most security-sensitive behavior is governance bypass: a change that could make `greenroom check` pass by silently weakening the policy, replacing the baseline, adding a waiver, changing canonical registry ownership, or modifying managed guard files.

Please report any bypass that allows routine code work to alter those surfaces without a blocking violation.

## Reporting

For a private disclosure, contact AVANT-ICONIC through the security contact published on the organization/profile before opening a public exploit report.

Do not include secrets, private repository contents, or credentials in a public issue.
