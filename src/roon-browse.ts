import RoonApiBrowse from "node-roon-api-browse";
import type {
  Item,
  RoonApiBrowseHierarchy,
  RoonApiBrowseLoadOptions,
  RoonApiBrowseLoadResponse,
  RoonApiBrowseOptions,
  RoonApiBrowseResponse
} from "node-roon-api-browse";
import type { RoonImageOptions } from "node-roon-api-image";
import { StatusCodes } from "@unfoldedcircle/integration-api";
import log from "./loggers.js";

const PAGE_SIZE = 100;

export type SearchMode = "hierarchy" | "browse";

export class BrowseService {
  constructor(
    private browseApi: RoonApiBrowse,
    private imageConfig: RoonImageOptions,
    private coreIp: string,
    private roonPort: number
  ) {}

  browse(opts: RoonApiBrowseOptions): Promise<RoonApiBrowseResponse> {
    return new Promise((resolve, reject) => {
      this.browseApi.browse(opts, (err, result) => {
        if (err) {
          reject(new Error(err));
          return;
        }
        resolve(result);
      });
    });
  }

  load(opts: RoonApiBrowseLoadOptions): Promise<RoonApiBrowseLoadResponse> {
    return new Promise((resolve, reject) => {
      this.browseApi.load(opts, (err, result) => {
        if (err) {
          reject(new Error(err));
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Resolves a media key from a path.
   *
   * @param {string[]} path - The path to resolve. For example, ["Library", "Artists", "Pink Floyd"]
   * @param {RoonApiBrowseHierarchy} hierarchy - The hierarchy to search in.
   * @param {string} [zoneId] - Optional zone ID.
   * @returns {Promise<string | StatusCodes>} - The resolved media key or a status code.
   */
  async resolveMediaKeyFromPath(
    path: string[],
    hierarchy: RoonApiBrowseHierarchy,
    zoneId?: string
  ): Promise<string | StatusCodes> {
    try {
      let totalCount = 0;
      let browseOptions: RoonApiBrowseOptions = {
        hierarchy,
        pop_all: true,
        zone_or_output_id: zoneId
      };

      let browseResult = await this.browse(browseOptions);
      if (browseResult.list) {
        totalCount = browseResult.list.count;
      }

      let items: Item[] = [];
      let lastFoundItem: Item | undefined;

      for (const element of path) {
        let found: Item | undefined;
        let searched = 0;

        log.debug(`Looking for: ${element}`);

        while (searched < totalCount && !found) {
          const loadResult = await this.load({
            hierarchy,
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
          return StatusCodes.NotFound;
        }

        lastFoundItem = found;

        if (found.hint === "action") {
          // If we found an action while traversing the path, we can't browse further.
          // In the context of playItemByPath, this is already a success.
          log.info(`Found action while traversing path: ${found.title}.`);
          return found.item_key || StatusCodes.Ok;
        }

        if (!found.item_key) {
          log.error(`Found item '${element}' but it has no item_key`);
          return StatusCodes.ServerError;
        }

        // Browse into the found item
        browseOptions = {
          hierarchy,
          item_key: found.item_key,
          zone_or_output_id: zoneId
        };

        browseResult = await this.browse(browseOptions);
        if (browseResult.list) {
          totalCount = browseResult.list.count;
        } else {
          log.error(`Exception trying to resolve media path: browse into '${element}' did not return a list`);
          return StatusCodes.ServerError;
        }
      }

      if (!lastFoundItem?.item_key) {
        return StatusCodes.NotFound;
      }

      return lastFoundItem.item_key;
    } catch (e) {
      log.error(`Error resolving path ${JSON.stringify(path)}: ${e}`);
      return StatusCodes.ServerError;
    }
  }

  buildImageUrl(imageKey: string): string {
    const { width, height, scale, format } = this.imageConfig;
    return `http://${this.coreIp}:${this.roonPort}/api/image/${imageKey}?scale=${scale}&width=${width}&height=${height}&format=${encodeURIComponent(format || "image/jpeg")}`;
  }

  /**
   * Plays a media item by its unique identifier.
   * This method interacts with the browse service to locate and initiate playback of the specified item.
   *
   * Logic from <https://github.com/pavoni/pyroon/blob/master/roonapi/roonapi.py>
   *
   * @param zoneId The zone ID to play the media in.
   * @param {string} mediaId - The unique identifier of the media item to play.
   * @param {RoonApiBrowseHierarchy} hierarchy - Optional hierarchy key if the item wasn't retrieved from a browse operation. Defaults to "browse".
   * @return {Promise<StatusCodes>} The status of the playback operation.
   * - `StatusCodes.Ok` if playback is successfully initiated.
   * - `StatusCodes.BadRequest` if the requested ID is unsupported or invalid.
   * - `StatusCodes.NotFound` if the requested ID could not be found.
   * - `StatusCodes.ServiceUnavailable` if the browse service is not available.
   * - `StatusCodes.ServerError` if an unexpected error occurs during the operation.
   */
  async playItemById(
    zoneId: string,
    mediaId: string,
    hierarchy: RoonApiBrowseHierarchy = "browse"
  ): Promise<StatusCodes> {
    log.info(`Playing item by ID: ${mediaId}`);
    try {
      // Initial browse call
      let browseResult = await this.browse({
        hierarchy,
        item_key: mediaId,
        zone_or_output_id: zoneId
      });

      // For Radio the above load starts play - so catch this and return
      if (browseResult?.list?.level === 0) {
        log.info("Initial load started playback");
        return StatusCodes.Ok;
      }

      if (!browseResult) {
        log.error(`Playback requested of unsupported id: ${mediaId}`);
        return StatusCodes.BadRequest;
      }

      // Load items at the current level
      let loadResult = await this.load({
        hierarchy,
        offset: 0,
        count: 1
      });

      if (!loadResult.items || loadResult.items.length === 0) {
        log.error(`No items found for id: ${mediaId}`);
        return StatusCodes.NotFound;
      }

      let firstItem = loadResult.items[0];
      if (!firstItem) {
        log.error(`No items found for id: ${mediaId}`);
        return StatusCodes.NotFound;
      }
      let hint = firstItem.hint;

      if (hint !== "action" && hint !== "action_list") {
        log.error(
          `Playback requested but item is a list, not a playable action or action_list id: ${mediaId} (hint: ${hint})`
        );
        return StatusCodes.ServerError;
      }

      if (hint === "action_list") {
        browseResult = await this.browse({
          hierarchy,
          item_key: firstItem.item_key,
          zone_or_output_id: zoneId
        });

        if (!browseResult) {
          log.error(`Playback requested of unsupported id: ${mediaId}`);
          return StatusCodes.BadRequest;
        }

        loadResult = await this.load({
          hierarchy,
          offset: 0,
          count: 1
        });

        firstItem = loadResult.items?.[0];
        if (!firstItem) {
          log.error(`No items found for id: ${mediaId}`);
          return StatusCodes.NotFound;
        }
        hint = firstItem.hint;
      }

      if (hint !== "action") {
        log.error(
          `Playback requested but item does not have a playable action id: ${mediaId}, ${JSON.stringify(browseResult)}`
        );
        return StatusCodes.BadRequest;
      }

      const playAction = loadResult.items[0];
      if (!playAction) {
        log.error(`No play action found for id: ${mediaId}`);
        return StatusCodes.BadRequest;
      }
      log.info(`'${playAction.title}' for '${JSON.stringify(browseResult)}'`);

      const execResult = await this.browse({
        hierarchy,
        item_key: playAction.item_key,
        zone_or_output_id: zoneId
      });

      if (!execResult) {
        log.error(`Playback requested of unsupported id: ${mediaId}`);
        return StatusCodes.BadRequest;
      }

      return StatusCodes.Ok;
    } catch (e: unknown) {
      log.error(`Error playing id ${mediaId}: ${e}`);
      if (e instanceof Error) {
        switch (e.message) {
          case "ZoneNotFound":
            return StatusCodes.ServiceUnavailable;
          case "InvalidItemKey":
            return StatusCodes.BadRequest;
        }
      }
      return StatusCodes.ServerError;
    }
  }

  /**
   * Play the media specified by a path.
   *
   * Logic from <https://github.com/pavoni/pyroon/blob/master/roonapi/roonapi.py>
   *
   * @param zoneId The zone ID to play the media in.
   * @param path A list allowing Roon to find the media
   *             e.g. ["Library", "Artists", "Neil Young", "Harvest"] or ["My Live Radio", "BBC Radio 4"]
   * @param action The roon action to take to play the media - leave blank to choose the roon default
   *               e.g. "Play Now", "Queue" or "Start Radio"
   * @return {Promise<StatusCodes>} The status of the playback operation.
   * - `StatusCodes.Ok` if playback is successfully initiated.
   * - `StatusCodes.BadRequest` if the requested ID is unsupported or invalid.
   * - `StatusCodes.NotFound` if the requested media patch could not be found.
   * - `StatusCodes.ServiceUnavailable` if the browse service is not available.
   * - `StatusCodes.ServerError` if an unexpected error occurs during the operation.
   */
  async playItemByPath(zoneId: string, path: string[], action?: string): Promise<StatusCodes> {
    log.info(`Playing item by path: ${JSON.stringify(path)} (action: ${action ?? "default"})`);
    try {
      const hierarchy = "browse";
      const resolved = await this.resolveMediaKeyFromPath(path, hierarchy, zoneId);

      if (typeof resolved !== "string") {
        return resolved;
      }

      const browseResult = await this.browse({
        hierarchy,
        item_key: resolved,
        zone_or_output_id: zoneId
      });

      if (!browseResult.list) {
        log.error("Exception trying to play media: browse into resolved item did not return a list");
        return StatusCodes.ServerError;
      }

      // Load items for the resolved level
      const loadResult = await this.load({
        hierarchy,
        offset: 0,
        count: PAGE_SIZE
      });
      let items = loadResult.items;

      if (items.length === 0) {
        log.error("No items found at the end of the path");
        return StatusCodes.NotFound;
      }

      const firstItem = items[0];
      if (!firstItem) {
        log.error("First item is unexpectedly undefined");
        return StatusCodes.ServerError;
      }

      // First item should be the action/action_list for playing this item (eg Play Genre, Play Artist, Play Album)
      if (firstItem.hint !== "action_list" && firstItem.hint !== "action") {
        log.error(
          `Found media does not have playable action_list hint='${firstItem.hint}' '${items.map((i) => i.title).join(", ")}'`
        );
        return StatusCodes.ServerError;
      }

      log.debug(`Found playable item: ${JSON.stringify(firstItem)}`);

      const playHeader = firstItem.title;
      if (firstItem.hint === "action_list") {
        if (!firstItem.item_key) {
          log.error(`Action list item '${firstItem.title}' has no item_key`);
          return StatusCodes.ServerError;
        }

        await this.browse({
          hierarchy,
          item_key: firstItem.item_key,
          zone_or_output_id: zoneId
        });

        const loadResult = await this.load({
          hierarchy,
          offset: 0,
          count: PAGE_SIZE
        });
        log.debug(`Playable item load result: ${JSON.stringify(loadResult)}`);
        items = loadResult.items;
      }

      // We should now have play actions (eg Play Now, Add Next, Queue action, Start Radio)
      log.debug(`Found ${items.length} play actions: ${JSON.stringify(items)}`);
      let takeAction: Item | undefined;
      if (!action) {
        takeAction = items[0];
      } else {
        takeAction = items.find((item) => item.title === action);
        if (!takeAction) {
          log.error(`Could not find play action '${action}' in ${items.map((i) => i.title).join(", ")}`);
          return StatusCodes.NotFound;
        }

        if (!takeAction.hint) {
          // pyroon logic:
          // "I think this is a roon API error - when playing a tag - there should be a hint here!
          //  so for now just ignore - and hope it's OK"
          log.debug(`No hint for action ${takeAction.title}`);
        } else if (takeAction.hint !== "action") {
          log.warn(`Found media does not have playable action ${takeAction.title} - ${takeAction.hint}`);
          return StatusCodes.NotFound;
        }
      }

      if (!takeAction || !takeAction.item_key) {
        log.error("No valid play action found");
        return StatusCodes.ServerError;
      }

      log.info(`Play action was '${playHeader}' / '${takeAction.title}'`);

      await this.browse({
        hierarchy,
        item_key: takeAction.item_key,
        zone_or_output_id: zoneId
      });

      return StatusCodes.Ok;
    } catch (e: unknown) {
      log.error(`Error playing path ${JSON.stringify(path)}: ${e}`);
      if (e instanceof Error) {
        switch (e.message) {
          case "ZoneNotFound":
            return StatusCodes.ServiceUnavailable;
          case "InvalidItemKey":
            return StatusCodes.BadRequest;
        }
      }
      return StatusCodes.ServerError;
    }
  }

  /**
   * Performs a full-text search based on the given query and parameters. The search can be executed
   * in different modes, such as "hierarchy" or "browse," depending on the use case and provided options.
   *
   * @param {string} query - The search string to query.
   * @param {number} offset - The offset for pagination purposes, specifying the starting index of results. 0-based.
   * @param {number} count - The number of items to retrieve for each search.
   * @param {Object} options - Additional options to customize the search behavior.
   * @param {string} [options.zoneId] - Optional zone or output ID to refine the search.
   * @param {string} [options.itemKey] - Optional key to specify an item when using the `browse` search mode.
   * @param {SearchMode} options.mode - The mode of the search: `hierarchy` for a hierarchical search, `browse` for a browse search.
   * @return {Promise<Item[] | number>} A promise that resolves to an array of search result items, or a status code indicating an error.
   */
  async fullTextSearch(
    query: string,
    offset: number,
    count: number,
    options: {
      zoneId?: string;
      itemKey?: string;
      mode: SearchMode;
    } = { mode: "hierarchy" }
  ): Promise<Item[] | number> {
    if (options.mode === "hierarchy") {
      const hierarchy = "search";
      log.info(`Hierarchy search: ${query}`);
      // Start a fresh search session
      const response = await this.browse({
        hierarchy,
        zone_or_output_id: options.zoneId,
        pop_all: true,
        input: query
      });

      // For a successful search, Roon responds with action "list"
      if (response.action !== "list") {
        log.warn("Unexpected search action:", response.action);
        return StatusCodes.ServerError;
      }

      // Load top‑level search results
      const loadResponse = await this.load({
        hierarchy,
        level: 0,
        offset,
        count
      });

      // Depending on Roon version, you may see sections like:
      // "Top Result", "Artists", "Albums", "Tracks", etc.
      loadResponse.items.forEach((item: Item) => {
        log.debug(item.title, item.subtitle, item.hint);
      });

      return loadResponse.items;
    } else {
      // alternative search if hierarchy search is not enough: NOT TESTED
      const hierarchy = "browse";
      const response = await this.browse({
        hierarchy,
        zone_or_output_id: options.zoneId,
        item_key: options.itemKey,
        input: query
      });
      if (response.action !== "list") {
        log.warn("Unexpected action from search:", response.action);
        return StatusCodes.ServerError;
      }

      const loadResponse = await this.load({
        hierarchy,
        offset,
        count
      });

      loadResponse.items.forEach((item: Item) => {
        log.debug(item.title, item.subtitle, item.hint);
      });

      return loadResponse.items;
    }
  }
}
