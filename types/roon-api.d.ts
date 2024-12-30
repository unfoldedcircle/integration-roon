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
  export interface NowPlaying {
    seek_position?: number;
    length?: number;
    image_key?: string;
    one_line: OneLine;
    two_line?: TwoLine;
    three_line?: ThreeLine;
  }
  export interface ZoneSettings {
    loop?: LoopSetting;
    shuffle?: boolean;
    auto_radio?: boolean;
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
  export interface Volume {
    type?: VolumeType;
    min?: number;
    max?: number;
    value?: number;
    step?: number;
    is_muted?: boolean;
  }
  export interface SourceControl {
    display_name: string;
    status: "selected" | "deselected" | "standby" | "indeterminate";
    supports_standby: boolean;
  }
  export interface Output {
    output_id: string;
    zone_id: string;
    display_name: string;
    state: PlaybackState;
    source_controls?: SourceControl[];
    volume?: Volume;
  }
  export interface Zone {
    zone_id: string;
    display_name: string;
    outputs: Output[];
    state: "playing" | "paused" | "loading" | "stopped";
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

  export interface Core {
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
    constructor(options: RoonApiOptions);
    /**
     * Initializes the services required, optional, and provided by the extension.
     * @param services Configuration for services.
     */
    init_services(services: InitServicesOptions): void;

    /**
     * Begins the discovery process to find/connect to a Roon Core.
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
     * Saves a key-value pair in the configuration data store.
     * @param key The configuration key.
     * @param value The value to save.
     */
    save_config(key: string, value: any): void;

    /**
     * Loads a value from the configuration data store.
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
