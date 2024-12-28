/**
 * Central log functions.
 *
 * Use [debug](https://www.npmjs.com/package/debug) module for logging.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import debugModule from "debug";

const log = {
  msgTrace: debugModule("roon:msg"),
  debug: debugModule("roon:debug"),
  info: debugModule("roon:info"),
  warn: debugModule("roon:warn"),
  error: debugModule("roon:error")
};

export default log;
