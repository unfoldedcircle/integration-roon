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
  const attr = new Map([]);

  if (!zone) {
    return attr;
  }

  // state
  switch (zone.state) {
    case "playing":
      attr.set([uc.MediaPlayerAttributes.State], uc.MediaPlayerStates.Playing);
      break;

    case "stopped":
    case "paused":
      attr.set([uc.MediaPlayerAttributes.State], uc.MediaPlayerStates.Paused);
      break;
  }

  if (zone.outputs && zone.outputs[0] && zone.outputs[0].volume) {
    // volume
    attr.set([uc.MediaPlayerAttributes.Volume], zone.outputs[0].volume.value);

    // muted
    attr.set([uc.MediaPlayerAttributes.Muted], zone.outputs[0].volume.is_muted);
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

  attr.set([uc.MediaPlayerAttributes.MediaTitle], mediaTitle);
  attr.set([uc.MediaPlayerAttributes.MediaArtist], mediaArtist);
  attr.set([uc.MediaPlayerAttributes.MediaAlbum], mediaAlbum);
  attr.set([uc.MediaPlayerAttributes.MediaDuration], mediaDuration);
  attr.set([uc.MediaPlayerAttributes.MediaPosition], mediaPosition);

  return attr;
};
