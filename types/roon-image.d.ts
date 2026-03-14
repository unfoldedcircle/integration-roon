declare module "node-roon-api-image" {
  import { Core } from "node-roon-api";

  interface RoonImageOptions {
    /** If this is not set, the image will be returned at original size. Warning: that could be very large! */
    scale?: "fit" | "fill" | "stretch";
    /** The image width to be returned. Required if the scale property is set */
    width?: number;
    /** The image height to be returned. Required if the scale property is set */
    height?: number;
    /** If you don't specify, Roon will choose for you. */
    format?: "image/jpeg" | "image/png";
  }

  /**
   * @callback RoonApiImage~imageresultcallback
   * @param {string | false} error - an error code or false if no error
   * @param {string} content_type - the MIME type of the image data
   * @param {Buffer} image - the image data
   */
  type RoonImageResultCallback = (error: string | false, contentType: string, image: Buffer) => void;

  /**
   * Roon API Image Service
   */
  export default class RoonApiImage {
    constructor(roon: Core);

    /**
     * Roon API services provide image_key properties. This translates the image_key into an actual image.
     *
     * It is also possible to issue image requests directly using HTTP if that is more convenient:
     *
     * http://IP:PORT/api/image/image_key?scale=XXX&width=XXX&height=XXX&format=XXX
     *
     * The rules for parameter types and optional/required follow the same as for the options parameter.
     *
     * @param image_key - the key, as given by another api
     * @param options - Options
     * @param cb - Called on success or error
     */
    get_image(image_key: string, options: RoonImageOptions, cb: RoonImageResultCallback): void;
  }
}
