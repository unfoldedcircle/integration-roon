import fs from "fs";
import { Zone } from "node-roon-api";

const CFG_FILENAME = "roon_config.json";

class Config {
  private zones: { [key: string]: Zone } = {};

  constructor() {
    this.loadFromFile();
  }

  public updateZone(zone: Zone) {
    this.zones[zone.zone_id] = zone;
    this.saveToFile();
  }

  public clear() {
    this.zones = {};
    this.saveToFile();
  }

  public getZone(zoneId: string): Zone | null {
    return this.zones[zoneId] ?? null;
  }

  public forEachZone(callback: (zone: Zone) => void) {
    for (const zone of this.getAllZones()) {
      callback(zone);
    }
  }

  private getAllZones(): Zone[] {
    return Object.values(this.zones);
  }

  private loadFromFile() {
    if (fs.existsSync(CFG_FILENAME)) {
      const data = fs.readFileSync(CFG_FILENAME, "utf-8");
      this.zones = JSON.parse(data);
    } else {
      this.saveToFile();
    }
  }

  private saveToFile() {
    const data = JSON.stringify(this.zones, null, 2);
    fs.writeFileSync(CFG_FILENAME, data, "utf-8");
  }
}

export default Config;
