/**
 * Utility functions of the Roon integration driver for Remote Two/3.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import fs from "fs";
import log from "./loggers.js";
import * as uc from "@unfoldedcircle/integration-api";
import { RepeatMode } from "@unfoldedcircle/integration-api";
import { LoopSetting, Zone } from "node-roon-api";

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
  const attr: { [key: string]: string | number | boolean } = {};

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
  }
  attr[uc.MediaPlayerAttributes.State] = state;

  if (zone.outputs && zone.outputs[0] && zone.outputs[0].volume) {
    // volume
    attr[uc.MediaPlayerAttributes.Volume] = zone.outputs[0].volume.value ?? 0;

    // muted
    attr[uc.MediaPlayerAttributes.Muted] = zone.outputs[0].volume.is_muted ?? false;
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

  return attr;
};

export function getLoopMode(repeat: string | undefined): LoopSetting {
  switch (repeat) {
    case RepeatMode.All:
      return "loop";
    case RepeatMode.One:
      return "loop_one";
    default:
      return "disabled";
  }
}

function getRepeatMode(zone: Zone): RepeatMode {
  switch (zone.settings?.loop) {
    case "loop":
      return RepeatMode.All;
    case "loop_one":
      return RepeatMode.One;
    default:
      return RepeatMode.Off;
  }
}

export function newEntityFromZone(zone: Zone, emptyAttributes: boolean = false) {
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
    uc.MediaPlayerFeatures.Repeat
  ];

  // TODO add & test REPEAT, SHUFFLE
  if (zone.outputs && zone.outputs[0] && zone.outputs[0].volume) {
    // FIXME #25 not all Roon zones support volume setting! Check for `type: incremental`
    features.push(uc.MediaPlayerFeatures.Volume);
    features.push(uc.MediaPlayerFeatures.VolumeUpDown);
  }

  const attributes = emptyAttributes ? {} : mediaPlayerAttributesFromZone(zone);
  const entity = new uc.MediaPlayer(
    zone.zone_id,
    { en: zone.display_name },
    {
      features,
      attributes
    }
  );

  return entity;
}
