/**
 * Media player entity for the Roon integration.
 *
 * @copyright (c) 2026 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import * as uc from "@unfoldedcircle/integration-api";
import log from "./loggers.js";

import type { LoopSetting, Output } from "node-roon-api";
import RoonApiTransport from "node-roon-api-transport";

/**
 * Interface for the Roon driver that the MediaPlayer needs to interact with.
 * This avoids circular dependencies.
 */
export interface RoonDriver {
  readonly roonPaired: boolean;
  readonly roonTransport: RoonApiTransport | null;
  getDefaultZoneOutput(zoneId: string): Output | undefined;
  setEntityState(entityId: string, state: uc.MediaPlayerStates): void;
}

/**
 * Convert Remote Two/3 repeat mode to Roon loop setting.
 *
 * @param repeat The repeat mode from Remote Two/3.
 * @returns The corresponding Roon loop setting.
 */
export function getLoopMode(repeat: string | undefined): LoopSetting {
  switch (repeat) {
    case uc.RepeatMode.All:
      return "loop";
    case uc.RepeatMode.One:
      return "loop_one";
    default:
      return "disabled";
  }
}

export class RoonMediaPlayer extends uc.MediaPlayer {
  constructor(
    id: string,
    name: uc.EntityName,
    params: uc.MediaPlayerParams,
    private readonly roonDriver: RoonDriver
  ) {
    super(id, name, params);
  }

  async command(cmdId: string, params?: { [key: string]: string | number | boolean }): Promise<uc.StatusCodes> {
    if (!this.roonDriver.roonPaired) {
      log.error(`Roon is not paired. Not executing command ${cmdId}`);
      this.roonDriver.setEntityState(this.id, uc.MediaPlayerStates.Unavailable);
      return uc.StatusCodes.ServiceUnavailable;
    }

    if (!this.roonDriver.roonTransport) {
      log.error(`RoonTransport is not initialized. Not executing command ${cmdId}`);
      this.roonDriver.setEntityState(this.id, uc.MediaPlayerStates.Unavailable);
      return uc.StatusCodes.ServiceUnavailable;
    }

    log.info(`Command: ${cmdId}`);

    return new Promise((resolve) => {
      switch (cmdId) {
        case uc.MediaPlayerCommands.PlayPause: {
          const roonCmd =
            this.attributes?.[uc.MediaPlayerAttributes.State] === uc.MediaPlayerStates.Playing ? "pause" : "play";
          this.roonDriver.roonTransport?.control(this.id, roonCmd, (error: string | false) => {
            if (error) {
              log.error(`Error on ${roonCmd} media player: ${error}`);
              // TODO parse `error` and handle certain error conditions like `ZoneNotFound`
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        }
        case uc.MediaPlayerCommands.Next:
          this.roonDriver.roonTransport?.control(this.id, "next", (error: string | false) => {
            if (error) {
              log.error(`Error next media player: ${error}`);
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        case uc.MediaPlayerCommands.Previous:
          this.roonDriver.roonTransport?.control(this.id, "previous", (error: string | false) => {
            if (error) {
              log.error(`Error previous media player: ${error}`);
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        case uc.MediaPlayerCommands.Volume: {
          const output = this.roonDriver.getDefaultZoneOutput(this.id);
          if (output) {
            this.roonDriver.roonTransport?.change_volume(
              output.output_id,
              "absolute",
              Number(params?.volume),
              (error: string | false) => {
                if (error) {
                  log.error(`Error changing volume media player: ${error}`);
                  resolve(uc.StatusCodes.ServerError);
                } else {
                  resolve(uc.StatusCodes.Ok);
                }
              }
            );
          } else {
            resolve(uc.StatusCodes.ServiceUnavailable);
          }
          break;
        }
        case uc.MediaPlayerCommands.VolumeUp: {
          const output = this.roonDriver.getDefaultZoneOutput(this.id);
          if (output) {
            this.roonDriver.roonTransport?.change_volume(
              output.output_id,
              "relative_step",
              1,
              (error: string | false) => {
                if (error) {
                  log.error(`Error changing volume media player: ${error}`);
                  resolve(uc.StatusCodes.ServerError);
                } else {
                  resolve(uc.StatusCodes.Ok);
                }
              }
            );
          } else {
            log.error(`Volume up, output not found, entity:${this.id}`);
            resolve(uc.StatusCodes.ServiceUnavailable);
          }
          break;
        }
        case uc.MediaPlayerCommands.VolumeDown: {
          const output = this.roonDriver.getDefaultZoneOutput(this.id);
          if (output) {
            this.roonDriver.roonTransport?.change_volume(
              output.output_id,
              "relative_step",
              -1,
              (error: string | false) => {
                if (error) {
                  log.error(`Error changing volume media player: ${error}`);
                  resolve(uc.StatusCodes.ServerError);
                } else {
                  resolve(uc.StatusCodes.Ok);
                }
              }
            );
          } else {
            resolve(uc.StatusCodes.ServiceUnavailable);
          }
          break;
        }
        case uc.MediaPlayerCommands.MuteToggle: {
          const output = this.roonDriver.getDefaultZoneOutput(this.id);
          if (output) {
            const roonCmd = this.attributes?.[uc.MediaPlayerAttributes.Muted] ? "unmute" : "mute";
            this.roonDriver.roonTransport?.mute(output.output_id, roonCmd, (error: string | false) => {
              if (error) {
                log.error(`Error on ${roonCmd} media player: ${error}`);
                resolve(uc.StatusCodes.ServerError);
              } else {
                resolve(uc.StatusCodes.Ok);
              }
            });
          } else {
            resolve(uc.StatusCodes.ServiceUnavailable);
          }
          break;
        }
        case uc.MediaPlayerCommands.Seek:
          this.roonDriver.roonTransport?.seek(
            this.id,
            "absolute",
            Number(params?.media_position),
            (error: string | false) => {
              if (error) {
                log.error(`Error seeking media player: ${error}`);
                resolve(uc.StatusCodes.ServerError);
              } else {
                resolve(uc.StatusCodes.Ok);
              }
            }
          );
          break;
        case uc.MediaPlayerCommands.Shuffle: {
          const shuffle = !!params?.shuffle;
          this.roonDriver.roonTransport?.change_settings(this.id, { shuffle }, (error: string | false) => {
            if (error) {
              log.error(`Shuffle error: ${error}`);
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        }
        case uc.MediaPlayerCommands.Repeat: {
          const repeat = params?.repeat?.toString();
          const loop = getLoopMode(repeat);
          this.roonDriver.roonTransport?.change_settings(this.id, { loop }, (error: string | false) => {
            if (error) {
              log.error(`Repeat error: ${error}`);
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        }
        default:
          log.warn(`Unknown entity command: ${cmdId}`);
          resolve(uc.StatusCodes.BadRequest);
      }
    });
  }

  async browse(options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    log.info(`TODO browse: ${JSON.stringify(options)}`);
    return uc.StatusCodes.NotImplemented;
  }

  async search(query: uc.SearchOptions): Promise<uc.StatusCodes | uc.SearchResult> {
    log.info(`TODO search: ${JSON.stringify(query)}`);
    return uc.StatusCodes.NotImplemented;
  }
}
