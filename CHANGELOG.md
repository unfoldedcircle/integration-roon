# Roon integration for Remote Two/3 Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

_Changes in the next release_

---

## 0.3.0 - 2024-12-19

### Added

- Creating a custom integration archive during build. This simplifies installing a custom version on the Remote.
- Automated linting checks.

### Fixed

- Integration should no longer loose authentication token when restarted.

### Changed

- Open Source release 🎉
- Major rework of the integration driver:
  - Converted project to TypeScript.
  - Using our new TypeScript integration-library.
- Storing Roon zone information locally for improved entity handling.
- Unique Roon extension name including the hostname where the integration is running.  
  This makes it much simpler to identify which device registers an extension, especially with multiple Remotes or as a developer running the integration on a computer.
