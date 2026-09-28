# Fixture: intentionally bad content for release-scan.mjs's own test

This file exists only so `release-scan --all scripts/__fixtures__/release-scan/bad` has something
real to catch. It is never referenced by any gate, never copied into a scaffolded project, and is
itself allowlisted below via its directory (see release-scan.mjs's own README note on fixtures).
Every term here is synthetic — none of it is a real brand, path, identity, or credential.

- A personal path: /Users/example-user/Projects/not-a-real-repo
- A private-term hit (see test-private-terms.txt, loaded via RELEASE_SCAN_PRIVATE_TERMS): acmecorp
- An identity leak: fake.person@example.com
- A credential-shaped string: sk-THISISNOTAREALKEYABCDEFGHIJKLMN
