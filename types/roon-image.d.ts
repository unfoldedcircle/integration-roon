declare module "node-roon-api-image" {
  import { Core } from "node-roon-api";

  interface RoonImageOptions {
    scale?: "fit" | "fill" | "stretch";
    width: number;
    height: number;
    format: "image/jpeg" | "image/png";
  }

  /**
   * @callback RoonApiImage~imageresultcallback
   * @param {string | false} error - an error code or false if no error
   * @param {string} content_type - the MIME type of the image data
   * @param {Buffer} image - the image data
   */
  type RoonImageResultCallback = (error: string | false, contentType: string, image: Buffer) => void;

  export default class RoonApiImage {
    constructor(roon: Core);

    get_image(image_id: string, opts: RoonImageOptions, cb: RoonImageResultCallback): Promise<any>;
  }
}
