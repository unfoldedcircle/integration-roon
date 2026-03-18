// Based on:
// - https://github.com/Stevenic/roon-kit/blob/main/packages/roon-kit/src/interfaces.ts
// - https://github.com/RoonLabs/node-roon-api-browse/blob/master/lib.js

declare module "node-roon-api-browse" {
  /**
   * Perform a browsing operation. Use this when the user selects an `Item`
   */
  export interface RoonApiBrowseOptions {
    /**
     * The hierarchy is being browsed.
     */
    hierarchy: RoonApiBrowseHierarchy;
    /**
     * If your application browses several instances of the same hierarchy at the same time, you can populate this to
     * distinguish between them. Most applications will omit this field.
     */
    multi_session_key?: string;
    /**
     * The key from an `Item` If you omit this, the most recent level will be re-loaded.
     */
    item_key?: string;
    /**
     * Input from the input box
     */
    input?: string;
    /**
     * Zone ID. This is required for any playback-related functionality to work.
     */
    zone_or_output_id?: string;
    /**
     * True to pop all levels but the first
     */
    pop_all?: boolean;
    /**
     * If set, pop n levels
     */
    pop_levels?: number;
    /**
     * If set, refresh the list contents
     */
    refresh_list?: boolean;
    /**
     * Update the display offset for the current list prior to performing the browse operation
     * <pre>
     *            If true, then the session will be reset so that browsing begins from the root of the hierarchy.
     *            If this is false or unset, then the core will attempt to resume at the previous browsing position
     *            It is not valid to provide `pop_all` and `item_key` at the same time
     * </pre>
     */
    set_display_offset?: number;
  }

  /**
   * The hierarchy is being browsed.
   *
   * Possible values include:
   *  * "browse" -- If you are exposing a general-purpose browser, this is what you should use
   *  * "playlists"
   *  * "settings"
   *  * "internet_radio"
   *  * "albums"
   *  * "artists"
   *  * "genres"
   *  * "composers"
   *  * "search"
   */
  export type RoonApiBrowseHierarchy =
    | "browse"
    | "playlists"
    | "settings"
    | "internet_radio"
    | "albums"
    | "artists"
    | "genres"
    | "composers"
    | "search";

  /**
   * Browse result body
   */
  export interface RoonApiBrowseResponse {
    /**
     * The action that the client should take as a result of this load
     * <pre>
     *                Possible values include:
     *
     *                 * "message"                - Display an message to the user, see the `message` and `is_error` properties
     *                 * "none"                   - No action is required
     *                 * "list"                   - The current list or its contents have changed. See the `list` property for the new level, and load items using the `load` request
     *                 * "replace_item"           - Replace the selected item with the item in the `item` property
     *                 * "remove_item"            - Remove the selected item
     * </pre>
     */
    action: string;
    /**
     * When the action is "replace_item", this is the replacement item
     */
    item?: Item;
    /**
     * When the action is "list", this represents the current list
     */
    list?: List;
    /**
     * When the action is 'message', this is the message to display
     */
    message?: string;
    /**
     * When the action is 'message', this indicates whether the message represents an error or not
     */
    is_error?: boolean;
  }

  /**
   * Roon API Browse Service: Item
   */
  export interface Item {
    /**
     * Title for this item
     */
    title: string;
    /**
     * Subtitle for this item
     */
    subtitle?: string;
    /**
     * Image for this item.
     */
    image_key?: string;
    /**
     * Pass this into a `browse` request when the user selects this item
     */
    item_key?: string;
    /**
     * A hint about what this item is
     * <pre>
     *            Possible values include:
     *                * `null`                 Unknown--display item generically
     *                * `"action"`             This item is an action
     *                * `"action_list"`        This item will load a list of actions at the next level
     *                * `"list"`               This item will load a list at the next level
     *                * `"header"`             A display-only header with no click action
     *
     *            Please make sure that your implementations allow for hints to be added in the future. If you see
     *            a hint that you do not recognize, treat it as a `null`
     *
     *        list hint = null | action_list
     *        item hint = null | action | action_list | list | header
     *</pre>
     */
    hint?: ItemHint | null;
    /**
     * If loading this item requires user input, then input_prompt will be populated.
     */
    input_prompt?: {
      /**
       * The prompt to display to the user: e.g. "Search Albums"
       */
      prompt: string;
      /**
       * The verb that goes with this action. This should be displayed on a button adjacent to the input. e.g. "Go"
       */
      action: string;
      /**
       * If non-null, then the value should be pre-populated
       */
      value?: string;
      /**
       * If true, then this should be displayed as a password input
       */
      is_password?: boolean;
    };
  }

  export type ItemHint = "action" | "action_list" | "list" | "header";

  /**
   * Roon API Browse Service: List
   */
  export interface List {
    /**
     * Title for this level
     */
    title: string;
    /**
     * Number of items in this level
     */
    count: number;
    /**
     * Subtitle in this level
     */
    subtitle?: string;
    image_key?: string;
    /**
     * increases from 0
     */
    level: number;
    /**
     * stored display offset for this list
     */
    display_offset?: number;
    /**
     * A hint about what this list is
     * <pre>
     *            Possible values include:
     *                * `null`                 Display as a generic list
     *                * `"action_list"`        Display as an action list
     *
     *            Please make sure that your implementations allow for hints to be added in the future. If you see
     *            a hint that you do not recognize, treat it as a `null`
     * </pre>
     */
    hint?: ListHint | null;
  }

  export type ListHint = "action_list";

  /**
   * Options for retrieving items from a browse level
   */
  export interface RoonApiBrowseLoadOptions {
    /**
     * Update the display offset for the current list
     */
    set_display_offset?: number;
    /**
     * Which level of the browse hierarchy to load from. Defaults to the current (deepest) level.
     */
    level?: number;
    /**
     * Offset into the list where loading should begin. Defaults to 0.
     */
    offset?: number;
    /**
     * Number of items to load. Defaults to 100.
     */
    count?: number;
    /**
     * The hierarchy is being browsed. See `browse` for a list of possible values
     */
    hierarchy: RoonApiBrowseHierarchy;
    /**
     * If your application browses several instances of the same hierarchy at the same time, you can populate this to
     * distinguish between them. Most applications will omit this field.
     */
    multi_session_key?: string;
    item_key?: string;
    zone_or_output_id?: string;
  }

  /**
   * Load result body
   */
  export interface RoonApiBrowseLoadResponse {
    items: Item[];
    offset: number;
    list: List;
  }

  /**
   * Callback called on success or error for browse request
   * @param err - an error code or false if no error
   * @param result - browse result
   */
  export type RoonBrowseCallback = (err: string | false, result: RoonApiBrowseResponse) => void;

  /**
   * Callback called on success or error for load request
   * @param err - an error code or false if no error
   * @param result - load result
   */
  export type RoonLoadCallback = (err: string | false, result: RoonApiBrowseLoadResponse) => void;

  /**
   * Roon API Browse service. The browse service allows you to present a hierarchical, list-based user interface for Roon.
   *
   * <p>Your browsing session is maintained on Roon's side, facilitating minimally stateful clients.</p>
   *
   * <p>## Sessions</p>
   *
   * <p>In order to facilitate minimally stateful clients and avoid situations where large amounts of data need to be
   * sent at once, the browse session state is maintained on the server (Roon Core) side. <p>
   *
   * <p> Requests to the browse service accept two arguments:
   * <ul style="list-style: none;">
   *     <li> `hierarchy` which identifies the hierarchy being browsed </p>
   *     <li> `multi_session_key`, which enables an extensions to browse multiple instances of the same hierarchy at once.
   *          Most applications should not use `multi_session_key`.
   * </ul></p>
   *
   * <p>Keep in mind when integrating with this API that in most cases, it will be better for the user to remember their
   * last browsing position. In other cases where starting the browse from the toplevel is more appropriate, call the
   * <tt>browse</tt> method with <tt>opts.pop_all</tt> set to <tt>true</tt></p>
   *
   * <p>## The Browse Stack</p>
   *
   * <p>Roon keeps track your browse stack, which consists of one or more _levels_.</p>
   *
   * <p>Levels are numbered starting from 0 (the top level). The level number increases as the user "drills down".</p>
   *
   * <p>An example application showing how to use the browse service is available here:
   * {@link https://github.com/roonlabs/roon-extension-web-testapp test web app}
   */
  class RoonApiBrowse {
    /**
     * Perform a browsing operation. Use this when the user selects an `Item`
     *
     * @param options - Options.
     * @param cb - Called on success or error
     */
    browse(options: RoonApiBrowseOptions, cb: RoonBrowseCallback): void;

    /**
     * Retrieve items from a browse level. Item loading is handled separately from browsing.
     * This allows clients to load very large lists in very small increments if needed.
     *
     * @param options - Options.
     * @param cb - Called on success or error
     */
    load(options: RoonApiBrowseLoadOptions, cb: RoonLoadCallback): void;
  }

  export default RoonApiBrowse;
}
