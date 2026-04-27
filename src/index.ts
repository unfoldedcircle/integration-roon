/**
 * This module implements the entry point of the Roon integration driver.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import debug from "debug";
import RoonDriver from "./roon-integration.js";

if (process.env.DEBUG === undefined) {
  debug.enable("roon:*,roonapi:info,roonapi:warn,roonapi:error,ucapi:info,ucapi:warn,ucapi:error");
}

const driver = new RoonDriver();
driver.init();
