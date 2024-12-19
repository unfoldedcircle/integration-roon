# Roon integration for Unfolded Circle Remotes

Unfolded Circle Remote integration driver for [Roon](https://roon.app/).

This integration driver is included in the Unfolded Circle Remote firmware and does not need to be run as external
integration to control Roon. A standalone driver can be used for development or custom functionality.

The integration implements the UC Remote [Integration-API](https://github.com/unfoldedcircle/core-api) which
communicates with JSON messages over WebSocket.

## Standalone usage

### Setup

Requirements:

- Remote Two firmware 1.9.3 or newer with support for custom integrations.
- Install [nvm](https://github.com/nvm-sh/nvm) (Node.js version manager) for local development.
- Node.js v20.16 or newer (older versions are not tested).
- Install required libraries:

```shell
npm install
```

For running a separate integration driver on your network for UC Remotes, the configuration in file
[driver.json](driver.json) needs to be changed:

- Set `driver_id` to a unique value, `uc_roon_driver` is already used for the embedded driver in the firmware.
- Change `name` to easily identify the driver in discovery & setup with the Remote or the web-configurator.
- Optionally add a `"port": 8090` field for the WebSocket server listening port.
  - Default port: `9090`
  - Also overrideable with environment variable `UC_INTEGRATION_HTTP_PORT`

### Run

Build JavaScript from TypeScript:

```shell
npm run build
```

Run as external integration driver:

```shell
UC_CONFIG_HOME=. UC_INTEGRATION_HTTP_PORT=8079 node dist/index.js
```

The configuration files are loaded & saved from the path specified in the environment variable `UC_CONFIG_HOME`.

- The Roon API library will automatically create and load the Roon pairing token from `config.json`.
- The Roon integration driver stores zone information in `roon_config.json`.

### Logging

The [Unfolded Circle Integration-API library](https://github.com/unfoldedcircle/integration-node-library) is using the
[debug](https://www.npmjs.com/package/debug) module for logging.

To enable the integration library logging, run the driver with the `DEBUG` environment variable set like:

```shell
DEBUG=* node dist/index.js
```

Additional information:

- [Node.js API wrapper log namespaces](https://github.com/unfoldedcircle/integration-node-library?tab=readme-ov-file#logging)
  - Enable WebSocket message trace: `ucapi:msg`

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the
[tags and releases in this repository](https://github.com/unfoldedcircle/integration-roon/releases).

## Changelog

The major changes found in each new release are listed in the [changelog](CHANGELOG.md)
and under the GitHub [releases](https://github.com/unfoldedcircle/integration-roon/releases).

## Contributions

Please read our [contribution guidelines](CONTRIBUTING.md) before opening a pull request.

## License

This project is licensed under the [**Mozilla Public License 2.0**](https://choosealicense.com/licenses/mpl-2.0/).
See the [LICENSE](LICENSE) file for details.
