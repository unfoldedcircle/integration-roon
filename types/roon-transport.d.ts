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

  export default class RoonApiTransport {
    constructor(roon: RoonApi);

    mute_all(how: MuteAction, cb?: ResultCallback): void;
    pause_all(cb?: ResultCallback): void;
    standby(output: Output | string, opts: { control_key?: string }, cb?: ResultCallback): void;
    toggle_standby(output: Output | string, opts: { control_key?: string }, cb?: ResultCallback): void;
    convenience_switch(output: Output | string, opts: { control_key?: string }, cb?: ResultCallback): void;
    mute(output: Output | string, how: MuteAction, cb?: ResultCallback): void;
    change_volume(output: Output | string, how: VolumeChangeHow, value: number, cb?: ResultCallback): void;
    seek(zoneOrOutput: Zone | Output | string, how: SeekHow, seconds: number, cb?: ResultCallback): void;
    control(zoneOrOutput: Zone | Output | string, control: ControlAction, cb?: ResultCallback): void;
    transfer_zone(
      fromZoneOrOutput: Zone | Output | string,
      toZoneOrOutput: Zone | Output | string,
      cb?: ResultCallback
    ): void;
    group_outputs(outputs: (Output | string)[], cb?: ResultCallback): void;
    ungroup_outputs(outputs: (Output | string)[], cb?: ResultCallback): void;
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
