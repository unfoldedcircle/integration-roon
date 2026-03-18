declare module "node-roon-api-transport" {
  import RoonApi from "node-roon-api";
  import {
    Output,
    MuteAction,
    ResultCallback,
    Zone,
    ControlAction,
    VolumeChangeHow,
    SeekHow,
    ZoneSettings
  } from "node-roon-api";

  type SubscribeZoneSubscribed = {
    zones: Zone[];
  };

  type SubscribeZoneChanged = {
    zones_added?: Zone[];
    zones_removed?: string[];
    zones_changed?: Zone[];
    zones_seek_changed?: {
      zone_id: string;
      queue_time_remaining: number;
      seek_position: number;
    }[];
  };

  type SubscribeZoneUnSubscribed = {};
  type SubscribeZoneMsg = SubscribeZoneSubscribed | SubscribeZoneChanged | SubscribeZoneUnSubscribed;
  type SubscribeZoneResponse = "Subscribed" | "Changed" | "Unsubscribed";

  /**
   * Roon API Transport Service
   */
  export default class RoonApiTransport {
    constructor(roon: RoonApi);

    /**
     * Mute/unmute all zones (that are mutable).
     * @param how - The action to take
     * @param cb - Called on success or error
     */
    mute_all(how: MuteAction, cb?: ResultCallback): void;

    /**
     * Pause all zones.
     * @param cb - Called on success or error
     */
    pause_all(cb?: ResultCallback): void;

    /**
     * Standby an output.
     *
     * @param output - The output to put into standby
     * @param opts - Options. If none, specify empty object ({}).
     * @param opts.control_key - The control_key that identifies the source_control that is to be put into standby. If omitted, then all source controls on this output that support standby will be put into standby.
     * @param cb - Called on success or error
     */
    standby(output: Output | string, opts: { control_key?: string }, cb?: ResultCallback): void;

    /**
     * Toggle the standby state of an output.
     *
     * @param output - The output that should have its standby state toggled.
     * @param opts - Options. If none, specify empty object ({}).
     * @param opts.control_key - The control_key that identifies the source_control that is to have its standby state toggled.
     * @param cb - Called on success or error
     */
    toggle_standby(output: Output | string, opts: { control_key?: string }, cb?: ResultCallback): void;

    /**
     * Convenience switch an output, taking it out of standby if needed.
     *
     * @param output - The output that should be convenience-switched.
     * @param opts - Options. If none, specify empty object ({}).
     * @param opts.control_key - The control_key that identifies the source_control that is to be switched. If omitted, then all controls on this output will be convenience switched.
     * @param cb - Called on success or error
     */
    convenience_switch(output: Output | string, opts: { control_key?: string }, cb?: ResultCallback): void;

    /**
     * Mute/unmute an output.
     * @param output - The output to mute.
     * @param how - The action to take
     * @param cb - Called on success or error
     */
    mute(output: Output | string, how: MuteAction, cb?: ResultCallback): void;

    /**
     * Change the volume of an output. Grouped zones can have differently behaving
     * volume systems (dB, min/max, steps, etc..), so you have to change the volume
     * different for each of those outputs.
     *
     * @param output - The output to change the volume on.
     * @param how - How to interpret the volume
     * @param value - The new volume value, or the increment value or step
     * @param cb - Called on success or error
     */
    change_volume(output: Output | string, how: VolumeChangeHow, value: number, cb?: ResultCallback): void;

    /**
     * Seek to a time position within the now playing media
     * @param zoneOrOutput - The zone or output
     * @param how - How to interpret the target seek position
     * @param seconds - The target seek position
     * @param cb - Called on success or error
     */
    seek(zoneOrOutput: Zone | Output | string, how: SeekHow, seconds: number, cb?: ResultCallback): void;

    /**
     * Execute a transport control on a zone.
     *
     * <p>Be sure that `is_<control>_allowed` is true on your {Zone} before allowing the user to operate controls</p>
     *
     * @param zoneOrOutput - The zone or output
     * @param control - The control desired
     * <pre>
     * "play" - If paused or stopped, start playback
     * "pause" - If playing or loading, pause playback
     * "playpause" - If paused or stopped, start playback. If playing or loading, pause playback.
     * "stop" - Stop playback and release the audio device immediately
     * "previous" - Go to the start of the current track, or to the previous track
     * "next" - Advance to the next track
     * </pre>
     *
     * @param cb - Called on success or error
     */
    control(zoneOrOutput: Zone | Output | string, control: ControlAction, cb?: ResultCallback): void;

    /**
     * Transfer the current queue from one zone to another
     *
     * @param fromZoneOrOutput - The source zone or output
     * @param toZoneOrOutput - The destination zone or output
     * @param cb - Called on success or error
     */
    transfer_zone(
      fromZoneOrOutput: Zone | Output | string,
      toZoneOrOutput: Zone | Output | string,
      cb?: ResultCallback
    ): void;

    /**
     * Create a group of synchronized audio outputs
     *
     * @param outputs - The outputs to group. The first output's zone's queue is preserved.
     * @param cb - Called on success or error
     */
    group_outputs(outputs: (Output | string)[], cb?: ResultCallback): void;

    /**
     * Ungroup outputs previous grouped
     *
     * @param outputs - The outputs to ungroup.
     * @param cb - Called on success or error
     */
    ungroup_outputs(outputs: (Output | string)[], cb?: ResultCallback): void;

    /**
     * Change zone settings
     *
     * @param zoneOrOutput - The zone or output
     * @param settings - The settings to change
     * @param settings.shuffle - If present, sets shuffle mode to the specified value
     * @param settings.auto_radio - If present, sets auto_radio mode to the specified value
     * @param settings.loop - If present, sets loop mode to the specified value. 'next' will cycle between the settings.
     * @param cb - Called on success or error
     */
    change_settings(zoneOrOutput: Zone | Output | string, settings: ZoneSettings, cb?: ResultCallback): void;
    get_zones(cb?: (error: false | string, body: { zones: Zone[] }) => void): void;
    get_outputs(cb: (error: false | string, body: { outputs: Output[] }) => void): void;
    subscribe_outputs(cb: (response: string, msg: any) => void): void;
    subscribe_zones(cb: (response: SubscribeZoneResponse, msg: SubscribeZoneMsg) => void): void;
    subscribe_queue(
      zoneOrOutput: Zone | Output | string,
      max_item_count: number,
      cb: (response: string, msg: any) => void
    ): void;
    play_from_here(
      zoneOrOutput: Zone | Output | string,
      queue_item_id: number,
      cb: (msg: { name: string } | null, body: any) => void
    ): void;
    zone_by_zone_id(zone_id: string): Zone | null;
    zone_by_output_id(output_id: string): Zone | null;
    zone_by_object(zoneOrOutput: Zone | Output | { zone_id?: string; output_id?: string }): Zone | null;
  }
}
