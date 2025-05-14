# Roon integration for Remote Two/3 Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

_Changes in the next release_

---

## 0.4.1 - 2025-05-14

### Fixed

- Remove unsupported OnOff feature. This triggered errors in the user interface when sending unsupported commands ([#60](https://github.com/unfoldedcircle/integration-roon/pull/60)).

## 0.4.0 - 2025-01-10

### Added

- Shuffle and repeat ([#28](https://github.com/unfoldedcircle/integration-roon/issues/28)).

### Fixed

- Much faster reconnection to Roon core after waking up from standby ([#59](https://github.com/unfoldedcircle/integration-roon/pull/59)).
- Sporadic runtime crashes in RoonApi library ([#19](https://github.com/unfoldedcircle/integration-roon/issues/19)).

## 0.3.1 - 2024-12-28

### Breaking Changes

- Setup flow must be run on the Remote to make sure the Roon zone configuration is properly stored.
  - Already configured entities can be left as is, they will work as long as the Roon zone is still available.
  - Roon zone configuration is now locally stored at the time of setup. New zones won't automatically create a new media-player entity ([#57](https://github.com/unfoldedcircle/integration-roon/pull/57)).

### Fixed

- Handle Roon core pairing / unpairing and zone added / removed events to set media-player entity state ([#57](https://github.com/unfoldedcircle/integration-roon/pull/57)).

### Changed

- Setup instructions at the start of the integration setup flow.
- Use debug module for logging ([#53](https://github.com/unfoldedcircle/integration-roon/issues/53)).

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
