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
  switch (zone.state) {
    case "playing":
      state = uc.MediaPlayerStates.Playing;
      break;
    case "stopped":
    case "paused":
      state = uc.MediaPlayerStates.Paused;
      break;
    case "loading":
      state = uc.MediaPlayerStates.Buffering;
      break;
  }
  attr[uc.MediaPlayerAttributes.State] = state;

  const volume = zone.outputs?.[0]?.volume;
  if (volume) {
    // volume
    if (volume.type !== "incremental") {
      attr[uc.MediaPlayerAttributes.Volume] = volume.value ?? 0;
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
    uc.MediaPlayerFeatures.SearchMedia
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
  return new RoonMediaPlayer(
    zone.zone_id,
    { en: zone.display_name },
    {
      features,
      attributes
    },
    driver
  );
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
