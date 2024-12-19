/**
 * Utility functions of the Roon integration driver for Remote Two/3.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import fs from "fs";
import * as uc from "@unfoldedcircle/integration-api";
import { Zone } from "node-roon-api";
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const convertImageToBase64 = (file: fs.PathOrFileDescriptor) => {
  let data: string | null = null;

  try {
    data = fs.readFileSync(file, "base64");
  } catch (e) {
    console.log(e);
  }

  return data;
};

export const mediaPlayerAttributesFromZone = (zone: Zone) => {
  const attr: { [key: string]: string | number | boolean } = {};

  if (!zone) {
    return attr;
  }

  // state
  switch (zone.state) {
    case "playing":
      attr[uc.MediaPlayerAttributes.State] = uc.MediaPlayerStates.Playing;
      break;

    case "stopped":
    case "paused":
      attr[uc.MediaPlayerAttributes.State] = uc.MediaPlayerStates.Paused;
      break;
  }

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

  return attr;
};

export function newEntityFromZone(zone: Zone, emptyAttributes: boolean = false) {
  const features = [
    uc.MediaPlayerFeatures.OnOff,
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
    uc.MediaPlayerFeatures.MediaImageUrl
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
