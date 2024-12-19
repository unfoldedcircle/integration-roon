/**
 * This module implements the entry point of the Roon integration driver.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import RoonDriver from "./roon-integration.js";

const driver = new RoonDriver();
driver.init();
