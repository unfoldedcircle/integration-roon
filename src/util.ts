/**
 * Utility functions of the Roon integration driver for Remote Two/3.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import fs from "fs";
import log from "./loggers.js";
import * as uc from "@unfoldedcircle/integration-api";
import { StatusCodes } from "@unfoldedcircle/integration-api";
import type { Zone } from "node-roon-api";
import { type RoonDriver, RoonMediaPlayer } from "./media-player.js";
import { calculateVolumeToPercentage } from "./volume.js";

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const convertImageToBase64 = (file: fs.PathOrFileDescriptor) => {
  let data: string | null = null;

  try {
    data = fs.readFileSync(file, "base64");
  } catch (e) {
    log.error(e);
  }

  return data;
};

export const mediaPlayerAttributesFromZone = (zone: Zone) => {
  const attr: uc.EntityAttributes = {};

  if (!zone) {
    return attr;
  }

  // state
  let state = uc.MediaPlayerStates.Unknown;

  // Logic from Home Assistant: power state from source control (if supported)
  let powerOff = false;
  let standbyFound = false;
  if (zone.outputs) {
    for (const output of zone.outputs) {
      if (output.source_controls) {
        for (const source of output.source_controls) {
          if (source.supports_standby && source.status !== "indeterminate") {
            standbyFound = true;
            if (source.status === "standby" || source.status === "deselected") {
              powerOff = true;
            }
            break;
          }
        }
      }
      if (standbyFound) {
        break;
      }
    }
  }

  if (powerOff) {
    state = uc.MediaPlayerStates.Off;
  } else {
    switch (zone.state) {
      case "playing":
        state = uc.MediaPlayerStates.Playing;
        break;
      case "stopped":
        // HA maps stopped to idle, but we don't have this state. Standby should work instead.
        state = uc.MediaPlayerStates.Standby;
        break;
      case "paused":
        state = uc.MediaPlayerStates.Paused;
        break;
      case "loading":
        state = uc.MediaPlayerStates.Buffering;
        break;
    }
  }
  attr[uc.MediaPlayerAttributes.State] = state;

  const volume = zone.outputs?.[0]?.volume;
  if (volume) {
    // volume
    if (volume.type !== "incremental") {
      attr[uc.MediaPlayerAttributes.Volume] = calculateVolumeToPercentage(volume);
    }

    // muted
    attr[uc.MediaPlayerAttributes.Muted] = volume.is_muted ?? false;
  }

  let mediaDuration = 0;
  let mediaPosition = 0;
  let mediaTitle = "";
  let mediaArtist = "";
  let mediaAlbum = "";

  if (zone.now_playing) {
    if (zone.now_playing.three_line) {
      mediaTitle = zone.now_playing.three_line.line1;
      mediaArtist = zone.now_playing.three_line.line2 || "";
      mediaAlbum = zone.now_playing.three_line.line3 || "";
    }

    if (zone.now_playing.length) {
      mediaDuration = zone.now_playing.length;
    }
    if (zone.now_playing.seek_position) {
      mediaPosition = zone.now_playing.seek_position;
    }
  }

  attr[uc.MediaPlayerAttributes.MediaTitle] = mediaTitle;
  attr[uc.MediaPlayerAttributes.MediaArtist] = mediaArtist;
  attr[uc.MediaPlayerAttributes.MediaAlbum] = mediaAlbum;
  attr[uc.MediaPlayerAttributes.MediaDuration] = mediaDuration;
  attr[uc.MediaPlayerAttributes.MediaPosition] = mediaPosition;

  attr[uc.MediaPlayerAttributes.Shuffle] = !!zone.settings?.shuffle;
  attr[uc.MediaPlayerAttributes.Repeat] = getRepeatMode(zone);

  // Note: play actions might not work for all media items. This requires further investigation.
  // Maybe we can also add "Play From Here" and "Start Radio"
  attr[uc.MediaPlayerAttributes.PlayMediaAction] = [
    uc.KnownMediaPlayAction.PlayNow,
    uc.KnownMediaPlayAction.PlayNext,
    uc.KnownMediaPlayAction.AddToQueue
  ];

  return attr;
};

/**
 * Checks if a zone supports standby based on its source controls.
 *
 * @param {Zone} zone The Roon zone to check.
 * @returns {boolean} true if standby is supported.
 */
export function getStandbySupport(zone: Zone): boolean {
  if (zone.outputs) {
    for (const output of zone.outputs) {
      if (output.source_controls) {
        for (const source of output.source_controls) {
          if (source.supports_standby && source.status !== "indeterminate") {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function getRepeatMode(zone: Zone): uc.RepeatMode {
  switch (zone.settings?.loop) {
    case "loop":
      return uc.RepeatMode.All;
    case "loop_one":
      return uc.RepeatMode.One;
    default:
      return uc.RepeatMode.Off;
  }
}

export function newEntityFromZone(zone: Zone, driver: RoonDriver, emptyAttributes: boolean = false) {
  const features = [
    uc.MediaPlayerFeatures.MuteToggle,
    uc.MediaPlayerFeatures.PlayPause,
    uc.MediaPlayerFeatures.Next,
    uc.MediaPlayerFeatures.Previous,
    uc.MediaPlayerFeatures.Seek,
    uc.MediaPlayerFeatures.MediaDuration,
    uc.MediaPlayerFeatures.MediaPosition,
    uc.MediaPlayerFeatures.MediaTitle,
    uc.MediaPlayerFeatures.MediaArtist,
    uc.MediaPlayerFeatures.MediaAlbum,
    uc.MediaPlayerFeatures.MediaImageUrl,
    uc.MediaPlayerFeatures.Shuffle,
    uc.MediaPlayerFeatures.Repeat,
    uc.MediaPlayerFeatures.BrowseMedia,
    uc.MediaPlayerFeatures.PlayMedia,
    uc.MediaPlayerFeatures.PlayMediaAction,
    uc.MediaPlayerFeatures.SearchMedia,
    uc.MediaPlayerFeatures.OnOff,
    uc.MediaPlayerFeatures.Toggle,
    uc.MediaPlayerFeatures.Stop
  ];

  // #25 not all Roon zones support volume setting
  const volume = zone.outputs?.[0]?.volume;
  if (volume) {
    if (volume.type !== "incremental") {
      features.push(uc.MediaPlayerFeatures.Volume);
    }
    features.push(uc.MediaPlayerFeatures.VolumeUpDown);
  }

  const attributes = emptyAttributes ? {} : mediaPlayerAttributesFromZone(zone);
  const options = {
    [uc.MediaPlayerOptions.StableIdSupport]: uc.StableIdSupport.BrowseSupportsStableIdsParam
  };
  const entity = new RoonMediaPlayer(
    zone.zone_id,
    { en: zone.display_name },
    {
      features,
      attributes,
      options
    },
    driver
  );

  if (!emptyAttributes) {
    entity.updateStandbySupport(getStandbySupport(zone));
  }

  return entity;
}

/**
 * Splits a media path string into an array of strings based on "/" as the delimiter,
 * while respecting quoted substrings (double quotes).
 *
 * Leading and trailing slashes are removed from the path.
 *
 * @param {string} path - The media path string to be split. Quoted sections are treated as single tokens.
 * @return {string[]} An array of strings obtained by splitting the input path. Quoted sections remain intact.
 */
export function splitMediaPath(path: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  if (path.startsWith("/")) {
    path = path.substring(1);
  }
  if (path.endsWith("/")) {
    path = path.substring(0, path.length - 1);
  }

  for (let i = 0; i < path.length; i++) {
    const char = path[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "/" && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Maps a Roon error (either an Error object or a string) to a UC StatusCodes.
 *
 * @param {unknown} e - The error to map.
 * @returns {StatusCodes} The corresponding UC status code.
 */
export function mapRoonErrorToStatusCode(e: unknown): StatusCodes {
  const message = e instanceof Error ? e.message : String(e);

  switch (message) {
    case "ZoneNotFound":
    case "ServiceUnavailable":
      return StatusCodes.ServiceUnavailable;
    case "InvalidItemKey":
      return StatusCodes.BadRequest;
    default:
      return StatusCodes.ServerError;
  }
}
