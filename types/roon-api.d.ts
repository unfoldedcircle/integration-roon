declare module "node-roon-api" {
  export type PlaybackState = "playing" | "paused" | "loading" | "stopped";
  export type MuteAction = "mute" | "unmute";
  export type ControlAction = "play" | "pause" | "playpause" | "stop" | "previous" | "next";
  export type VolumeType = "number" | "db" | "incremental" | string;
  export type SeekHow = "relative" | "absolute";
  export type VolumeChangeHow = "absolute" | "relative" | "relative_step";
  export type LoopSetting = "loop" | "loop_one" | "disabled" | "next";
  export interface OneLine {
    line1: string;
  }
  export interface TwoLine {
    line1: string;
    line2?: string;
  }
  export interface ThreeLine {
    line1: string;
    line2?: string;
    line3?: string;
  }
  /**
   * Now-playing information for a zone.
   */
  export interface NowPlaying {
    /** Seek Position in seconds, if applicable */
    seek_position?: number;
    /** Length of media in seconds, if applicable */
    length?: number;
    /** Now-playing image */
    image_key?: string;
    /** Display text for one-line displays */
    one_line: OneLine;
    /** Display text for two-line displays */
    two_line?: TwoLine;
    /** Display text for three-line displays */
    three_line?: ThreeLine;
  }
  /**
   * The settings for a zone.
   */
  export interface ZoneSettings {
    /** loop setting on the zone */
    loop?: LoopSetting;
    /** indicates whether shuffle is enabled on the zone */
    shuffle?: boolean;
    /** indicates whether auto-radio mode is enabled on the zone */
    auto_radio?: boolean;
  }
  /**
   * Roon API Transport Service: Zone
   */
  export interface Zone {
    zone_id: string;
    /** Display Name for this zone */
    display_name: string;
    /** The outputs in this zone */
    outputs: Output[];
    state: PlaybackState;
    /** Current seek position for the zone */
    seek_position?: number;
    /** Indicates whether the "previous" control is supported */
    is_previous_allowed: boolean;
    /** Indicates whether the "next" control is supported */
    is_next_allowed: boolean;
    /** Indicates whether the "pause" control is supported */
    is_pause_allowed: boolean;
    /** Indicates whether the "play" control is supported */
    is_play_allowed: boolean;
    /** Indicates whether the "seek" control is supported */
    is_seek_allowed: boolean;
    /** Number of items in the play queue for this zone */
    queue_items_remaining?: number;
    /** Number of seconds remaining in the play queue for this zone */
    queue_time_remaining?: number;
    /** The default values for parties. */
    settings?: ZoneSettings;
    /** Now-playing information for this zone, if playback is active */
    now_playing?: NowPlaying;
  }
  /**
   * Volume control information for an output.
   * <p style='white-space: pre-wrap;'>
   * Note that volume values, bounds, and step are floating point values, not integers, and that volume ranges can extend below and above zero, sometimes at the same time.
   * </p>
   */
  export interface Volume {
    /**
     * If you receive an unanticipated value for this, treat it like "number".
     * The "incremental" type represents a volume control that just has "+" and "-" buttons,
     * with no feedback about the current volume value or its range.
     */
    type?: VolumeType;
    /** The minimum value in the volume range */
    min?: number;
    /** The maximum value in the volume range */
    max?: number;
    /** The current value of the volume control */
    value?: number;
    /** The step size for the volume control, in terms of its native units */
    step?: number;
    /** True if the zone is muted, false otherwise */
    is_muted?: boolean;
  }
  /**
   * Source control information for an output.
   */
  export interface SourceControl {
    /** Display Name for this source control */
    display_name: string;
    status: "selected" | "deselected" | "standby" | "indeterminate";
    /** true if this source control supports standby */
    supports_standby: boolean;
    /** (Added based on JS context) control_key identifies the source control */
    control_key?: string;
  }
  /**
   * Roon API Transport Service: Output
   */
  export interface Output {
    output_id: string;
    /** The zone that this output is a part of */
    zone_id: string;
    /** Display Name for this output */
    display_name: string;
    state: PlaybackState;
    /** Source controls for this output. */
    source_controls?: SourceControl[];
    /** This field is populated for outputs that support volume control. */
    volume?: Volume;
  }
  export interface Zone {
    zone_id: string;
    display_name: string;
    outputs: Output[];
    state: PlaybackState;
    seek_position?: number;
    is_previous_allowed: boolean;
    is_next_allowed: boolean;
    is_pause_allowed: boolean;
    is_play_allowed: boolean;
    is_seek_allowed: boolean;
    queue_items_remaining?: number;
    queue_time_remaining?: number;
    settings?: ZoneSettings;
    now_playing?: NowPlaying;
  }
  export type ResultCallback = (error: false | string, body?: any) => void;

  export interface Transport {
    host: string;
    port: string;
    is_alive?: boolean;
  }

  export interface Moo {
    transport: Transport;
  }

  export interface Core {
    moo: Moo;
    core_id: string;
    display_name: string;
    display_version: string;
    services: {
      [key: string]: any;
    };
  }
  /**
   * Represents a subscription specification for a service.
   */
  export interface SubscriptionSpec {
    /** The name of the subscription method (e.g., "subscribe_pairing"). */
    subscribe_name: string;
    /** The name of the unsubscription method (e.g., "unsubscribe_pairing"). */
    unsubscribe_name: string;
    /**
     * Function to handle the start of a subscription.
     * @param req The subscription request.
     */
    start: (req: any) => void;
    /**
     * (Optional) Function to handle the end of a subscription.
     * @param req The unsubscription request.
     */
    end?: (req: any) => void;
  }
  /**
   * Represents a service specification.
   */
  export interface ServiceSpec {
    /** (Optional) List of subscription specifications for the service. */
    subscriptions?: SubscriptionSpec[];
    /** Methods provided by the service. */
    methods: {
      [methodName: string]: (req: any) => void;
    };
  }
  /**
   * Represents a registered service.
   */
  export interface RegisteredService {
    /** The name of the service. */
    name: string;
    /** Internal subtype mappings (used for managing subscriptions). */
    _subtypes: {
      [subscribeName: string]: {
        [mooid: string]: any;
      };
    };
    /**
     * Sends a "continue" message to all subscribers of a specific subtype.
     * @param subtype The subtype name.
     * @param name The message name.
     * @param props The message properties.
     */
    send_continue_all: (subtype: string, name: string, props: any) => void;
    /**
     * Sends a "complete" message to all subscribers of a specific subtype.
     * @param subtype The subtype name.
     * @param name The message name.
     * @param props The message properties.
     */
    send_complete_all: (subtype: string, name: string, props: any) => void;
  }
  /**
   * Represents the options for initializing services.
   */
  export interface InitServicesOptions {
    /** (Optional) List of required services that the Roon Core must provide. */
    required_services?: any[];
    /** (Optional) List of optional services that the Roon Core may provide. */
    optional_services?: any[];
    /** (Optional) List of services that this extension provides to the Roon Core. */
    provided_services?: any[];
  }

  /**
   * Represents a pairing service.
   */
  export interface PairingService {
    /** The list of services provided by the pairing service. */
    services: RegisteredService[];
    /** Callback invoked when a Core is found for pairing. */
    found_core: (core: Core) => void;
    /** Callback invoked when a Core is lost from pairing. */
    lost_core: (core: Core) => void;
  }

  /**
   * Represents the options required to initialize a Roon extension.
   */
  export interface RoonApiOptions {
    /** A unique ID for this extension, e.g., "@com.your_company_or_name.name_of_extension@". */
    extension_id: string;
    /** The display name of your extension. */
    display_name: string;
    /** The version string displayed to the user for this extension. */
    display_version: string;
    /** The name of the developer of the extension. */
    publisher: string;
    /** The developer's contact email. */
    email: string;
    /** (Optional) Website for more information about the extension. */
    website?: string;
    /** (Optional) Directory to store configuration files. */
    configDir?: string;
    /** (Optional) Callback invoked when Roon pairs your extension with a Core. */
    core_paired?: (core: Core) => void;
    /** (Optional) Callback invoked when Roon unpairs your extension from a Core. */
    core_unpaired?: (core: Core) => void;
    /** (Optional) Callback invoked when a Roon Core is found during discovery. */
    core_found?: (core: Core) => void;
    /** (Optional) Callback invoked when a Roon Core is lost during discovery. */
    core_lost?: (core: Core) => void;
    /** (Optional) Function to persist state data. */
    set_persisted_state?: (state: any) => void;
    /** (Optional) Function to retrieve persisted state data. */
    get_persisted_state?: () => any;
  }

  /**
   * Represents the RoonApi class.
   */
  export default class RoonApi {
    /**
     * @param options - Information about your extension. Used by Roon to display to the end user what is trying to access Roon.
     */
    constructor(options: RoonApiOptions);
    /**
     * Initializes the services you require and that you provide.
     * @param services Configuration for services.
     */
    init_services(services: InitServicesOptions): void;

    /**
     * Begin the discovery process to find/connect to a Roon Core.
     */
    start_discovery(): void;

    /**
     * Stop the discovery process to automatically connect to a Roon core.
     *
     * To restart the discovery process, call `start_discovery` again.
     */
    stop_discovery(): void;

    /**
     * Disconnect all Roon core WebSocket connections.
     *
     * To remain disconnected, call `stop_discovery` first.
     */
    disconnect_all(): void;

    /**
     * Internal method for periodic scanning during discovery.
     * Not intended for external use.
     */
    periodic_scan(): void;

    /**
     * Save a key value pair in the configuration data store.
     * @param key The configuration key.
     * @param value The value to save.
     */
    save_config(key: string, value: any): void;

    /**
     * Load a key value pair in the configuration data store.
     * @param key The configuration key.
     * @returns The loaded value, or undefined if not found.
     */
    load_config(key: string): any;

    /**
     * Registers a service with the Roon Core.
     * @param svcname The name of the service.
     * @param spec The service specification.
     * @returns The registered service instance.
     */
    register_service(svcname: string, spec: ServiceSpec): RegisteredService;
  }
}
