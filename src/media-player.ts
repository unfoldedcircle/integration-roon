/**
 * Media player entity for the Roon integration.
 *
 * @copyright (c) 2026 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import * as uc from "@unfoldedcircle/integration-api";
import { KnownMediaClass, KnownMediaContentType, SearchResult } from "@unfoldedcircle/integration-api";
import { type MediaContentType } from "@unfoldedcircle/integration-api";
import log from "./loggers.js";

import type { LoopSetting, Output } from "node-roon-api";
import RoonApiTransport from "node-roon-api-transport";
import type { Item, RoonApiBrowseHierarchy, RoonApiBrowseOptions } from "node-roon-api-browse";
import type { BrowseService } from "./roon-browse.js";
import { splitMediaPath } from "./util.js";

const EXCLUDE_ITEMS = [
  "Play Album",
  "Play Artist",
  "Play Playlist",
  "Play Composer",
  "Play Genre",
  "Play Now",
  "Play From Here",
  "Queue",
  "Start Radio",
  "Add Next",
  "Play Radio",
  "Play Work",
  "Settings",
  "Search",
  "Search Tidal",
  "Search Qobuz"
];

/**
 * Interface for the Roon driver that the MediaPlayer needs to interact with.
 * This avoids circular dependencies.
 */
export interface RoonDriver {
  readonly roonPaired: boolean;
  readonly roonTransport: RoonApiTransport | null;
  readonly browseService: BrowseService | null;
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
    zoneId: string,
    name: uc.EntityName,
    params: uc.MediaPlayerParams,
    private readonly roonDriver: RoonDriver
  ) {
    super(zoneId, name, params);
  }

  async command(cmdId: string, params?: uc.EntityCommandParams): Promise<uc.StatusCodes> {
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
        case uc.MediaPlayerCommands.PlayMedia: {
          const itemKey = params?.media_id as string;
          const mediaType = params?.media_type as string;
          const action = params?.action as string;

          if (!this.roonDriver.browseService) {
            return uc.StatusCodes.ServiceUnavailable;
          }

          if (mediaType === "library" || mediaType === "track" || mediaType === "search") {
            if (action) {
              log.warn("Play action parameter is not supported");
            }
            // media_id is a roon browser id
            // Roon quirk: a media_id returned from a search requires matching hierarchy.
            const hierarchy: RoonApiBrowseHierarchy = mediaType === "search" ? "search" : "browse";

            resolve(this.roonDriver.browseService.playItemById(this.id, itemKey, hierarchy));
          } else {
            // media_id is a path matching the Roon menu structure
            const pathList = splitMediaPath(itemKey);
            let playAction;

            // best effort play action. Might work, or not with the mysterious Roon API
            switch (action) {
              case uc.KnownMediaPlayAction.PlayNow: {
                // use default action
                break;
              }
              case uc.KnownMediaPlayAction.PlayNext: {
                playAction = "Add Next";
                break;
              }
              case uc.KnownMediaPlayAction.AddToQueue: {
                playAction = "Queue";
                break;
              }
              default:
                log.warn(`Ignoring unsupported play action: ${action}`);
                break;
            }

            resolve(this.roonDriver.browseService.playItemByPath(this.id, pathList, playAction));
          }
          break;
        }
        default:
          log.warn(`Unknown entity command: ${cmdId}`);
          resolve(uc.StatusCodes.BadRequest);
      }
    });
  }

  async search(search: uc.SearchOptions): Promise<uc.StatusCodes | uc.SearchResult> {
    log.debug(`Media search: ${JSON.stringify(search)}`);

    // Roon searching is a PITA. Anyone know how to get an item path back?
    if (search.stable_ids === true) {
      log.warn(`Stable IDs are not supported for media search`);
    }
    if (search.media_id || search.media_type) {
      log.warn(`Media ID and type are not supported for media search`);
    }

    try {
      if (!this.roonDriver.browseService) {
        return uc.StatusCodes.ServiceUnavailable;
      }

      const result = await this.roonDriver.browseService.fullTextSearch(
        search.query,
        search.paging.offset,
        search.paging.limit
      );
      if (typeof result === "number") {
        return result;
      }

      log.debug(`Search results: ${JSON.stringify(result)}`);

      // The search hierarchy key has to be propagated, otherwise the result items can't be used for play or browse actions!
      const items = this.convertItems(result, { mediaType: "search" });
      return new SearchResult(items, new uc.Pagination(search.paging.page, search.paging.limit));
    } catch (e: unknown) {
      log.error(`Error searching: ${e}`);
      if (e instanceof Error) {
        switch (e.message) {
          case "ZoneNotFound":
            return uc.StatusCodes.ServiceUnavailable;
          case "InvalidItemKey":
            return uc.StatusCodes.BadRequest;
        }
      }
      return uc.StatusCodes.ServerError;
    }
  }

  async browse(options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    log.debug(`browse: ${JSON.stringify(options)}`);

    if (options.stable_ids === true) {
      return await this.browseByPath(options);
    } else {
      return await this.browseByItemKey(options);
    }
  }

  /**
   * Browse with the native Roon media key. This is the preferred way to browse Roon media.
   *
   * - The `media_id` is the native Roon media key.
   * - The `media_type` is a hint for the Roon hierarchy to use:
   *   - `search`: for the `search` hierarchy, e.g., browsing from a search result.
   *   - all other values: use `browse` hierarchy.
   */
  private async browseByItemKey(options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    if (!this.roonDriver.browseService) {
      log.warn(`Browse service not available`);
      return uc.StatusCodes.ServiceUnavailable;
    }

    let contentId;
    let browseOptions: RoonApiBrowseOptions;

    // Roon quirk: a media_id returned from a search requires matching hierarchy.
    // We only have two entry points for now: media browsing and searching.
    // Note: we also store other special media types in `media_type`, not only RoonApiBrowseHierarchy values!
    const hierarchy: RoonApiBrowseHierarchy = options.media_type === "search" ? "search" : "browse";
    const mediaTypeOverride = hierarchy === "search" ? "search" : undefined;

    if (!options.media_id) {
      // Reset browse stack to root
      browseOptions = {
        hierarchy,
        pop_all: true
        // zone_or_output_id: this.id // zone is not required for browsing
      };
      contentId = "Explore"; // same as root title
    } else {
      browseOptions = {
        hierarchy,
        item_key: options.media_id
      };
      contentId = options.media_id;
    }

    return this.executeBrowse(options, browseOptions, contentId, mediaTypeOverride);
  }

  /**
   * Browse with a path-based media key.
   *
   * This is a workaround to get stable media item identifiers for playback.
   * For example, mapping UI buttons to favorite albums, playlists, etc.
   *
   * Attention: this may lead to non-unique media IDs! The first match is used.
   *
   * - The `media_id` contains the media path. Each Roon level is represented by its title, levels separated by /
   * - The `media_type` is set to `path`.
   */
  private async browseByPath(options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    if (!this.roonDriver.browseService) {
      log.warn(`Browse service not available`);
      return uc.StatusCodes.ServiceUnavailable;
    }

    let browseOptions: RoonApiBrowseOptions;
    const hierarchy = "browse";
    const mediaTypeOverride = "path";

    if (!options.media_id) {
      // Reset browse stack to root
      browseOptions = {
        hierarchy,
        pop_all: true
        // zone_or_output_id: this.id // zone is not required for browsing
      };
      options.media_id = ""; // empty path means root
    } else {
      const path = splitMediaPath(options.media_id);
      const resolved = await this.roonDriver.browseService.resolveMediaKeyFromPath(path, hierarchy);
      if (typeof resolved !== "string") {
        return resolved;
      }
      browseOptions = {
        hierarchy,
        item_key: resolved
      };
    }

    return this.executeBrowse(options, browseOptions, options.media_id, mediaTypeOverride, options.media_id);
  }

  /**
   * Internal helper to execute a browse and load command.
   *
   * @param options UC browse options.
   * @param browseOptions Roon browse options.
   * @param contentId The content ID for the resulting browse item.
   * @param mediaType Optional media type override.
   * @param mediaPath Optional media path for path-based browsing.
   * @returns A browse result or an error status code.
   */
  private async executeBrowse(
    options: uc.BrowseOptions,
    browseOptions: RoonApiBrowseOptions,
    contentId: string,
    mediaType?: MediaContentType,
    mediaPath?: string
  ): Promise<uc.StatusCodes | uc.BrowseResult> {
    if (!this.roonDriver.browseService) {
      log.warn(`Browse service not available`);
      return uc.StatusCodes.ServiceUnavailable;
    }

    const hierarchy = browseOptions.hierarchy;
    const browseService = this.roonDriver.browseService;

    try {
      const resultHeader = await browseService.browse(browseOptions);

      if (resultHeader.action !== "list" || !resultHeader.list) {
        throw new Error(`Unexpected response from root browse. Action: ${resultHeader.action}`);
      }

      log.debug(`Browse result header: ${JSON.stringify(resultHeader)}`);

      const header = resultHeader.list;
      const totalCount = header.count;
      const title = header.title;

      const loadResult = await browseService.load({
        hierarchy,
        offset: options.paging.offset,
        count: options.paging.limit
      });

      log.debug(`Browse result detail: ${JSON.stringify(loadResult)}`);

      const children = this.convertItems(loadResult.items, {
        listImageId: resultHeader.list.image_key,
        mediaType,
        mediaPath
      });
      const browseItem = new uc.BrowseMediaItem(contentId, title, {
        subtitle: header.subtitle,
        media_class: KnownMediaClass.Directory,
        media_type: mediaType,
        can_browse: children.length > 0,
        thumbnail: resultHeader.list.image_key ? browseService.buildImageUrl(resultHeader.list.image_key) : undefined,
        items: children
      });

      return uc.BrowseResult.fromPaging(browseItem, options.paging, totalCount);
    } catch (e: unknown) {
      log.error(`Error browsing: ${e}`);
      if (e instanceof Error) {
        switch (e.message) {
          case "ZoneNotFound":
            return uc.StatusCodes.ServiceUnavailable;
          case "InvalidItemKey":
            return uc.StatusCodes.BadRequest;
        }
      }
      return uc.StatusCodes.ServerError;
    }
  }

  /**
   * Map Roon items to UC media items.
   */
  private convertItems(
    items: Item[],
    override?: { listImageId?: string; mediaType?: MediaContentType; mediaPath?: string }
  ): uc.BrowseMediaItem[] {
    return items
      .filter((item) => !EXCLUDE_ITEMS.includes(item.title))
      .map((item) => {
        const imageId = item.image_key || override?.listImageId;
        const thumbnail =
          imageId && this.roonDriver.browseService ? this.roonDriver.browseService.buildImageUrl(imageId) : undefined;

        const mediaContentId =
          typeof override?.mediaPath === "string"
            ? this.createMediaPath(override.mediaPath, item.title)
            : item.item_key || "";
        // use a media type to indicate this is a native media id. If the client omits the media_type, the media_id is a path
        let mediaContentType: MediaContentType = "library";
        const mediaClass = this.getMatchingMediaClass(item);
        let canBrowse = true;

        const hint = item.hint;
        if (hint === "list") {
          canBrowse = true;
        } else if (hint === "action_list") {
          canBrowse = false;
        } else if (hint === "action") {
          mediaContentType = KnownMediaContentType.Track;
          canBrowse = false;
        } else {
          // Roon API says to treat unknown as a list
          log.warn(`Unknown hint ${item.title} - ${hint}`);
        }

        // override media_type
        if (override?.mediaType) {
          mediaContentType = override.mediaType;
        }

        return new uc.BrowseMediaItem(mediaContentId, item.title, {
          subtitle: item.subtitle,
          media_class: mediaClass,
          media_type: mediaContentType,
          can_play: true,
          can_browse: canBrowse,
          thumbnail
        });
      });
  }

  private createMediaPath(rootPath: string, title: string): string {
    const escape = title.includes("/") ? '"' : "";
    const root = rootPath ? `${rootPath}/` : "";
    return `${root}${escape}${title}${escape}`;
  }

  private getMatchingMediaClass(item: Item): uc.MediaClass {
    switch (item.hint) {
      case "list":
        // oh well, if Roon's API only returns a bit more metadata. Parsing strings is not fun and might break any time...
        switch (item.title) {
          case "Playlists":
            return KnownMediaClass.Playlist;
          case "Artists":
            return KnownMediaClass.Artist;
          case "Albums":
            return KnownMediaClass.Album;
          case "Genres":
            return KnownMediaClass.Genre;
          case "Composers":
            return KnownMediaClass.Composer;
          case "My Live Radio":
            return KnownMediaClass.Radio;
          case "Tracks":
            return KnownMediaClass.Track;
        }
        return KnownMediaClass.Directory;
      case "action_list":
        return KnownMediaClass.Playlist;
      case "action":
        return KnownMediaClass.Track;
      default:
        return KnownMediaClass.Directory;
    }
  }
}
