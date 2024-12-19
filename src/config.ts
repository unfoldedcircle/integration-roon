import fs from "fs";
import { Zone } from "node-roon-api";
import path from "path";

const CFG_FILENAME = "roon_config.json";

class Config {
  private zones: { [key: string]: Zone } = {};
  private configPath: string;

  constructor(configDir: string) {
    this.configPath = path.join(configDir, CFG_FILENAME);
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
    if (fs.existsSync(this.configPath)) {
      const data = fs.readFileSync(this.configPath, "utf-8");
      this.zones = JSON.parse(data);
    } else {
      this.saveToFile();
    }
  }

  private saveToFile() {
    const data = JSON.stringify(this.zones, null, 2);
    fs.writeFileSync(this.configPath, data, "utf-8");
  }
}

export default Config;
