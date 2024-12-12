declare module "node-roon-api-status" {
  import RoonApi from "node-roon-api";
  export default class RoonApiStatus {
    constructor(roon: RoonApi);
    get_status(): Promise<any>;
    set_status(status: string, is_error: boolean): void;
  }
}
