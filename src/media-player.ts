/**
 * Media player entity for the Roon integration.
 *
 * @copyright (c) 2026 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import * as uc from "@unfoldedcircle/integration-api";
import { KnownMediaClass, KnownMediaContentType } from "@unfoldedcircle/integration-api";
import log from "./loggers.js";

import type { LoopSetting, Output } from "node-roon-api";
import RoonApiTransport from "node-roon-api-transport";
import type { BrowseService } from "./roon-browse.js";
import type { Item, RoonApiBrowseHierarchy, RoonApiBrowseOptions } from "node-roon-api-browse";
import { splitMediaPath } from "./util.js";
import type { MediaContentType } from "@unfoldedcircle/integration-api/dist/mjs/lib/entities/media_player.js";

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

const PAGE_SIZE = 100;

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
        case uc.MediaPlayerCommands.PlayMedia: {
          const itemKey = params?.media_id as string;
          const mediaType = params?.media_type as string;

          if (mediaType === "library" || mediaType === "track") {
            // media_id is a roon browser id
            resolve(this.playItemById(itemKey));
          } else {
            // media_id is a path matching the Roon menu structure
            const pathList = splitMediaPath(itemKey);
            resolve(this.playItemByPath(pathList));
          }
          break;
        }
        default:
          log.warn(`Unknown entity command: ${cmdId}`);
          resolve(uc.StatusCodes.BadRequest);
      }
    });
  }

  async browse(options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    if (!this.roonDriver.browseService) {
      log.warn(`Browse service not available`);
      return uc.StatusCodes.ServiceUnavailable;
    }

    log.debug(`browse: ${JSON.stringify(options)}`);

    let contentId;
    let browseOptions: RoonApiBrowseOptions;
    if (!options.media_id) {
      let hierarchy: RoonApiBrowseHierarchy = "browse";
      switch (options.media_type) {
        case KnownMediaContentType.Playlist:
          hierarchy = "playlists";
          break;
        case KnownMediaContentType.Radio:
          hierarchy = "internet_radio";
          break;
        case KnownMediaContentType.Album:
          hierarchy = "albums";
          break;
        case KnownMediaContentType.Artist:
          hierarchy = "artists";
          break;
        case KnownMediaContentType.Genre:
          hierarchy = "genres";
          break;
        case KnownMediaContentType.Composer:
          hierarchy = "composers";
          break;
      }
      // Reset browse stack to root
      browseOptions = {
        hierarchy,
        pop_all: true
        // zone_or_output_id: this.id // zone is not required for browsing
      };
      contentId = "Explore";
    } else {
      browseOptions = {
        hierarchy: "browse",
        // multi_session_key: "roon_integration", // likely not required
        item_key: options.media_id
      };
      contentId = options.media_id;
    }
    try {
      const resultHeader = await this.roonDriver.browseService.browse(browseOptions);

      if (resultHeader.action !== "list" || !resultHeader.list) {
        throw new Error(`Unexpected response from root browse. Action: ${resultHeader.action}`);
      }

      log.info(`Browse result header: ${JSON.stringify(resultHeader)}`);

      const header = resultHeader.list;
      const totalCount = header.count;
      let title = header.title;
      const subtitle = header.subtitle;

      if (subtitle) {
        title = `${title} ${subtitle}`;
      }

      const loadResult = await this.roonDriver.browseService.load({
        hierarchy: "browse",
        offset: options.paging.offset,
        count: options.paging.limit
      });

      log.info(`Browse result detail: ${JSON.stringify(loadResult)}`);

      const children = this.convertItems(loadResult.items, resultHeader.list.image_key);
      const browseItem = new uc.BrowseMediaItem(contentId, title, {
        media_class: KnownMediaClass.Directory,
        can_browse: children.length > 0,
        thumbnail: resultHeader.list.image_key
          ? this.roonDriver.browseService.buildImageUrl(resultHeader.list.image_key)
          : undefined,
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

  async search(query: uc.SearchOptions): Promise<uc.StatusCodes | uc.SearchResult> {
    log.info(`TODO search: ${JSON.stringify(query)}`);
    return uc.StatusCodes.NotImplemented;
  }

  private convertItems(items: Item[], listImageId?: string): uc.BrowseMediaItem[] {
    return items
      .filter((item) => !EXCLUDE_ITEMS.includes(item.title))
      .map((item) => {
        const title = item.title;
        const subtitle = item.subtitle;
        const displayTitle = subtitle ? `${title} (${subtitle})` : title;

        const imageId = item.image_key || listImageId;
        const thumbnail =
          imageId && this.roonDriver.browseService ? this.roonDriver.browseService.buildImageUrl(imageId) : undefined;

        const mediaContentId = item.item_key || "";
        // use a media type to indicate this is a native media id. If the client omits the media_type, the media_id is a path
        let mediaContentType: MediaContentType = "library";
        const mediaClass = this.getMatchingMediaClass(item, displayTitle);
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
          log.warn(`Unknown hint ${title} - ${hint}`);
        }

        return new uc.BrowseMediaItem(mediaContentId, displayTitle, {
          media_class: mediaClass,
          media_type: mediaContentType,
          can_play: true,
          can_browse: canBrowse,
          thumbnail
        });
      });
  }

  private getMatchingMediaClass(item: Item, displayTitle: string): uc.MediaClass {
    switch (item.hint) {
      case "list":
        // oh well, if Roon's API only returns a bit more metadata. Parsing strings is not fun and might break any time...
        switch (displayTitle) {
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

  /**
   * Plays a media item by its unique identifier.
   * This method interacts with the browse service to locate and initiate playback of the specified item.
   *
   * Logic from <https://github.com/pavoni/pyroon/blob/master/roonapi/roonapi.py>
   *
   * @param {string} mediaId - The unique identifier of the media item to play.
   * @return {Promise<uc.StatusCodes>} A promise resolving to the status code of the playback operation.
   * - `uc.StatusCodes.Ok` if playback is successfully initiated.
   * - `uc.StatusCodes.BadRequest` if the requested ID is unsupported or invalid.
   * - `uc.StatusCodes.ServiceUnavailable` if the browse service is not available.
   * - `uc.StatusCodes.ServerError` if an unexpected error occurs during the operation.
   */
  async playItemById(mediaId: string): Promise<uc.StatusCodes> {
    log.info(`Playing item by ID: ${mediaId}`);
    try {
      // Initial browse call
      if (!this.roonDriver.browseService) {
        return uc.StatusCodes.ServiceUnavailable;
      }
      let browseResult = await this.roonDriver.browseService.browse({
        hierarchy: "browse",
        item_key: mediaId,
        zone_or_output_id: this.id
      });

      // For Radio the above load starts play - so catch this and return
      if (browseResult?.list?.level === 0) {
        log.info("Initial load started playback");
        return uc.StatusCodes.Ok;
      }

      if (!browseResult) {
        log.error(`Playback requested of unsupported id: ${mediaId}`);
        return uc.StatusCodes.BadRequest;
      }

      // Load items at the current level
      if (!this.roonDriver.browseService) {
        return uc.StatusCodes.ServiceUnavailable;
      }
      let loadResult = await this.roonDriver.browseService.load({
        hierarchy: "browse",
        offset: 0,
        count: 1
      });

      if (!loadResult.items || loadResult.items.length === 0) {
        log.error(`No items found for id: ${mediaId}`);
        return uc.StatusCodes.BadRequest;
      }

      let firstItem = loadResult.items[0];
      if (!firstItem) {
        log.error(`No items found for id: ${mediaId}`);
        return uc.StatusCodes.BadRequest;
      }
      let hint = firstItem.hint;

      if (hint !== "action" && hint !== "action_list") {
        log.error(
          `Playback requested but item is a list, not a playable action or action_list id: ${mediaId} (hint: ${hint})`
        );
        return uc.StatusCodes.BadRequest;
      }

      if (hint === "action_list") {
        if (!this.roonDriver.browseService) {
          return uc.StatusCodes.ServiceUnavailable;
        }
        browseResult = await this.roonDriver.browseService.browse({
          hierarchy: "browse",
          item_key: firstItem.item_key,
          zone_or_output_id: this.id
        });

        if (!browseResult) {
          log.error(`Playback requested of unsupported id: ${mediaId}`);
          return uc.StatusCodes.BadRequest;
        }

        if (!this.roonDriver.browseService) {
          return uc.StatusCodes.ServiceUnavailable;
        }
        loadResult = await this.roonDriver.browseService.load({
          hierarchy: "browse",
          offset: 0,
          count: 1
        });

        firstItem = loadResult.items?.[0];
        if (!firstItem) {
          log.error(`No items found for id: ${mediaId}`);
          return uc.StatusCodes.BadRequest;
        }
        hint = firstItem.hint;
      }

      if (hint !== "action") {
        log.error(
          `Playback requested but item does not have a playable action id: ${mediaId}, ${JSON.stringify(browseResult)}`
        );
        return uc.StatusCodes.BadRequest;
      }

      const playAction = loadResult.items[0];
      if (!playAction) {
        log.error(`No play action found for id: ${mediaId}`);
        return uc.StatusCodes.BadRequest;
      }
      log.info(`'${playAction.title}' for '${JSON.stringify(browseResult)}'`);

      if (!this.roonDriver.browseService) {
        return uc.StatusCodes.ServiceUnavailable;
      }
      const execResult = await this.roonDriver.browseService.browse({
        hierarchy: "browse",
        item_key: playAction.item_key,
        zone_or_output_id: this.id
      });

      if (!execResult) {
        log.error(`Playback requested of unsupported id: ${mediaId}`);
        return uc.StatusCodes.BadRequest;
      }

      return uc.StatusCodes.Ok;
    } catch (e: unknown) {
      log.error(`Error playing id ${mediaId}: ${e}`);
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
   * Play the media specified by a path.
   *
   * Logic from <https://github.com/pavoni/pyroon/blob/master/roonapi/roonapi.py>
   *
   * @param path A list allowing roon to find the media
   *             e.g. ["Library", "Artists", "Neil Young", "Harvest"] or ["My Live Radio", "BBC Radio 4"]
   * @param action The roon action to take to play the media - leave blank to choose the roon default
   *               e.g. "Play Now", "Queue" or "Start Radio"
   * @returns The status of the operation.
   */
  async playItemByPath(path: string[], action?: string): Promise<uc.StatusCodes> {
    log.info(`Playing item by path: ${JSON.stringify(path)} (action: ${action ?? "default"})`);
    try {
      let totalCount = 0;
      let browseOptions: RoonApiBrowseOptions = {
        hierarchy: "browse",
        pop_all: true,
        zone_or_output_id: this.id
      };

      // Initial browse to get the root total count
      if (!this.roonDriver.browseService) {
        return uc.StatusCodes.ServiceUnavailable;
      }
      let browseResult = await this.roonDriver.browseService.browse(browseOptions);
      if (browseResult.list) {
        totalCount = browseResult.list.count;
      }

      let items: Item[] = [];

      for (const element of path) {
        let found: Item | undefined;
        let searched = 0;

        log.debug(`Looking for ${element}`);

        while (searched < totalCount && !found) {
          if (!this.roonDriver.browseService) {
            return uc.StatusCodes.ServiceUnavailable;
          }
          const loadResult = await this.roonDriver.browseService.load({
            hierarchy: "browse",
            offset: searched,
            count: PAGE_SIZE
          });

          items = loadResult.items;
          for (const item of items) {
            searched++;
            if (item.title === element) {
              found = item;
              break;
            }
          }

          if (items.length === 0) {
            break;
          }
        }

        if (!found) {
          log.error(`Could not find media path element '${element}' in ${items.map((i) => i.title).join(", ")}`);
          return uc.StatusCodes.NotFound;
        }

        if (found.hint === "action") {
          log.info(`Found action while traversing path: ${found.title}. Starting playback.`);
          return uc.StatusCodes.Ok;
        }

        if (!found.item_key) {
          log.error(`Found item '${element}' but it has no item_key`);
          return uc.StatusCodes.BadRequest;
        }

        // Browse into the found item
        browseOptions = {
          hierarchy: "browse",
          item_key: found.item_key,
          zone_or_output_id: this.id
        };

        if (!this.roonDriver.browseService) {
          return uc.StatusCodes.ServiceUnavailable;
        }
        browseResult = await this.roonDriver.browseService.browse(browseOptions);
        if (browseResult.list) {
          totalCount = browseResult.list.count;
        } else {
          log.error(`Exception trying to play media: browse into '${element}' did not return a list`);
          return uc.StatusCodes.ServerError;
        }

        // Load items for the next level
        if (!this.roonDriver.browseService) {
          return uc.StatusCodes.ServiceUnavailable;
        }
        const loadResult = await this.roonDriver.browseService.load({
          hierarchy: "browse",
          offset: 0,
          count: PAGE_SIZE
        });
        items = loadResult.items;
      }

      if (items.length === 0) {
        log.error("No items found at the end of the path");
        return uc.StatusCodes.NotFound;
      }

      const firstItem = items[0];
      if (!firstItem) {
        log.error("First item is unexpectedly undefined");
        return uc.StatusCodes.ServerError;
      }

      // First item should be the action/action_list for playing this item (eg Play Genre, Play Artist, Play Album)
      if (firstItem.hint !== "action_list" && firstItem.hint !== "action") {
        log.error(
          `Found media does not have playable action_list hint='${firstItem.hint}' '${items.map((i) => i.title).join(", ")}'`
        );
        return uc.StatusCodes.BadRequest;
      }

      const playHeader = firstItem.title;
      if (firstItem.hint === "action_list") {
        if (!firstItem.item_key) {
          log.error(`Action list item '${firstItem.title}' has no item_key`);
          return uc.StatusCodes.BadRequest;
        }

        if (!this.roonDriver.browseService) {
          return uc.StatusCodes.ServiceUnavailable;
        }
        await this.roonDriver.browseService.browse({
          hierarchy: "browse",
          item_key: firstItem.item_key,
          zone_or_output_id: this.id
        });

        if (!this.roonDriver.browseService) {
          return uc.StatusCodes.ServiceUnavailable;
        }
        const loadResult = await this.roonDriver.browseService.load({
          hierarchy: "browse",
          offset: 0,
          count: PAGE_SIZE
        });
        items = loadResult.items;
      }

      // We should now have play actions (eg Play Now, Add Next, Queue action, Start Radio)
      let takeAction: Item | undefined;
      if (!action) {
        takeAction = items[0];
      } else {
        takeAction = items.find((item) => item.title === action);
        if (!takeAction) {
          log.error(`Could not find play action '${action}' in ${items.map((i) => i.title).join(", ")}`);
          return uc.StatusCodes.BadRequest;
        }

        if (takeAction.hint && takeAction.hint !== "action") {
          log.warn(`Found media does not have playable action ${takeAction.title} - ${takeAction.hint}`);
          // Python code continues anyway in some cases due to "roon API error"
        }
      }

      if (!takeAction || !takeAction.item_key) {
        log.error("No valid play action found");
        return uc.StatusCodes.BadRequest;
      }

      log.info(`Play action was '${playHeader}' / '${takeAction.title}'`);

      if (!this.roonDriver.browseService) {
        return uc.StatusCodes.ServiceUnavailable;
      }
      await this.roonDriver.browseService.browse({
        hierarchy: "browse",
        item_key: takeAction.item_key,
        zone_or_output_id: this.id
      });

      return uc.StatusCodes.Ok;
    } catch (e: unknown) {
      log.error(`Error playing path ${JSON.stringify(path)}: ${e}`);
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
}
