import RoonApiBrowse from "node-roon-api-browse";
import type {
  RoonApiBrowseLoadOptions,
  RoonApiBrowseLoadResponse,
  RoonApiBrowseOptions,
  RoonApiBrowseResponse
} from "node-roon-api-browse";
import type { RoonImageOptions } from "node-roon-api-image";

/**
 * An extended version of the Roon API browse item.
 * Includes the artwork URL and the item key.
 */
export interface BrowseItem {
  title: string;
  subtitle?: string;
  itemKey?: string;
  hint?: string | null;
  artworkUrl?: string;
}

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

  buildImageUrl(imageKey: string): string {
    const { width, height, scale, format } = this.imageConfig;
    return `http://${this.coreIp}:${this.roonPort}/api/image/${imageKey}?scale=${scale}&width=${width}&height=${height}&format=${encodeURIComponent(format || "image/jpeg")}`;
  }
}
