/**
 * Volume utility functions for Roon integration.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import type { Volume } from "node-roon-api";

export type ChangeVolumeHow = "relative" | "relative_step" | "absolute";

export interface ChangeVolumeResult {
  how: ChangeVolumeHow;
  value: number;
}

/**
 * Calculates the parameters for increasing the volume by one step.
 *
 * @param {Volume} v The Roon volume object.
 * @returns {ChangeVolumeResult} The change volume command parameters.
 */
export function calculateVolumeUp(v: Volume): ChangeVolumeResult {
  switch (v.type) {
    case "incremental":
      return { how: "relative", value: 1 };
    case "db":
    case "number":
    default: {
      return { how: "relative_step", value: 1 };
    }
  }
}

/**
 * Calculates the parameters for decreasing the volume by one step.
 *
 * @param {Volume} v The Roon volume object.
 * @returns {ChangeVolumeResult} The change volume command parameters.
 */
export function calculateVolumeDown(v: Volume): ChangeVolumeResult {
  switch (v.type) {
    case "incremental":
      return { how: "relative", value: -1 };
    case "db":
    case "number":
    default: {
      return { how: "relative_step", value: -1 };
    }
  }
}

/**
 * Calculates the parameters for setting the volume to a normalized value (0..1).
 *
 * @param {Volume} v The Roon volume object.
 * @param {number} norm The normalized volume value (0..1).
 * @returns {ChangeVolumeResult} The change volume command parameters.
 * @throws {Error} If the volume control does not support absolute volume setting.
 */
export function calculateVolumeNormalized(v: Volume, norm: number): ChangeVolumeResult {
  if (v.type === "incremental") {
    throw new Error("Incremental volume does not support absolute volume setting");
  }

  if (v.min === undefined || v.max === undefined) {
    throw new Error("Volume range (min/max) not provided by Roon");
  }

  // Clamp 0..1
  const clamped = Math.min(1, Math.max(0, norm));
  let value = v.min + (v.max - v.min) * clamped;

  const step = v.step ?? 1.0;
  if (Number.isInteger(step)) {
    value = Math.round(value);
  }

  return { how: "absolute", value };
}

/**
 * Calculates the parameters for setting the volume to an absolute native value.
 *
 * @param {Volume} v The Roon volume object.
 * @param {number} nativeValue The native volume value.
 * @returns {ChangeVolumeResult} The change volume command parameters.
 * @throws {Error} If the volume control does not support absolute volume setting.
 */
export function calculateVolumeAbsolute(v: Volume, nativeValue: number): ChangeVolumeResult {
  if (v.type === "incremental") {
    throw new Error("Incremental volume does not support absolute volume setting");
  }

  const min = v.min ?? nativeValue;
  const max = v.max ?? nativeValue;
  let clamped = Math.min(max, Math.max(min, nativeValue));

  const step = v.step ?? 1.0;
  if (Number.isInteger(step)) {
    clamped = Math.round(clamped);
  }

  return { how: "absolute", value: clamped };
}

/**
 * Calculates the percentage (0..100) of the current volume value.
 *
 * @param {Volume} v The Roon volume object.
 * @returns {number} The volume percentage (0..100).
 */
export function calculateVolumeToPercentage(v: Volume): number {
  if (v.type === "incremental" || v.min === undefined || v.max === undefined || v.value === undefined) {
    return 0;
  }
  const range = v.max - v.min;
  if (range === 0) {
    return 0;
  }
  const percentage = ((v.value - v.min) / range) * 100;
  return Math.round(percentage);
}
