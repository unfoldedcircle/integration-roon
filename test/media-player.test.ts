import test from "ava";
import * as uc from "@unfoldedcircle/integration-api";
import { RoonMediaPlayer, type RoonDriver } from "../src/media-player.js";
import type { BrowseService } from "../src/roon-browse.js";
import type { Item, RoonApiBrowseLoadResponse, RoonApiBrowseResponse } from "node-roon-api-browse";

function createTestPlayer(browseServicePartial: Partial<BrowseService>): RoonMediaPlayer {
  const driver: RoonDriver = {
    roonPaired: true,
    roonTransport: null,
    browseService: {
      buildImageUrl: (imageKey: string) => `http://localhost/image/${imageKey}`,
      ...browseServicePartial
    } as BrowseService,
    getDefaultZoneOutput: () => undefined,
    setEntityState: () => {}
  };

  return new RoonMediaPlayer("zone-1", "Living Room", {}, driver);
}

test("browse (item_key mode): handles empty and whitespace titles on header and items", async (t) => {
  const items: Item[] = [
    {
      title: "",
      subtitle: "Unknown Artist",
      item_key: "123:1",
      hint: "list"
    },
    {
      title: "   ",
      subtitle: "Untagged Track",
      item_key: "123:2",
      hint: "action"
    },
    {
      title: "  Valid Album  ",
      subtitle: "Artist",
      item_key: "123:3",
      hint: "list"
    }
  ];

  const player = createTestPlayer({
    browse: async (): Promise<RoonApiBrowseResponse> => ({
      action: "list",
      list: {
        level: 2,
        title: "",
        subtitle: "Unknown Artist",
        count: items.length
      }
    }),
    load: async (): Promise<RoonApiBrowseLoadResponse> => ({
      items,
      offset: 0,
      list: {
        level: 2,
        title: "",
        count: items.length
      }
    })
  });

  const options: uc.BrowseOptions = {
    media_id: "123:0",
    stable_ids: false,
    paging: new uc.Paging(1, 10)
  };

  const res = await player.browse(options);
  t.true(res instanceof uc.BrowseResult);
  const browseResult = res as uc.BrowseResult;

  t.is(browseResult.media?.title, "Untitled");
  t.is(browseResult.media?.items?.length, 3);

  const [emptyList, whitespaceAction, validList] = browseResult.media!.items!;

  t.is(emptyList?.title, "Untitled");
  t.is(emptyList?.media_id, "123:1");
  t.is(emptyList?.can_play, true);
  t.is(emptyList?.can_browse, true);

  t.is(whitespaceAction?.title, "Untitled");
  t.is(whitespaceAction?.media_id, "123:2");
  t.is(whitespaceAction?.can_play, true);
  t.is(whitespaceAction?.can_browse, false);

  t.is(validList?.title, "Valid Album");
  t.is(validList?.media_id, "123:3");
  t.is(validList?.can_play, true);
  t.is(validList?.can_browse, true);
});

test("browse (path mode at root and subpath): marks empty and whitespace titles as non-addressable", async (t) => {
  const items: Item[] = [
    {
      title: "",
      subtitle: "Unknown Artist",
      item_key: "123:1",
      hint: "list"
    },
    {
      title: "   ",
      subtitle: "Blank Artist",
      item_key: "123:2",
      hint: "action"
    },
    {
      title: "  Untrimmed Album  ",
      subtitle: "Artist",
      item_key: "123:3",
      hint: "list"
    }
  ];

  const player = createTestPlayer({
    resolveMediaKeyFromPath: async () => "123:0",
    browse: async (): Promise<RoonApiBrowseResponse> => ({
      action: "list",
      list: {
        level: 2,
        title: "Albums",
        count: items.length
      }
    }),
    load: async (): Promise<RoonApiBrowseLoadResponse> => ({
      items,
      offset: 0,
      list: {
        level: 2,
        title: "Albums",
        count: items.length
      }
    })
  });

  // 1. Root browse in path mode (media_id omitted -> mediaPath = "")
  const rootRes = await player.browse({
    stable_ids: true,
    paging: new uc.Paging(1, 10)
  });
  t.true(rootRes instanceof uc.BrowseResult);
  const rootItems = (rootRes as uc.BrowseResult).media!.items!;

  t.is(rootItems[0]?.title, "Untitled");
  t.is(rootItems[0]?.can_play, false);
  t.is(rootItems[0]?.can_browse, false);

  t.is(rootItems[1]?.title, "Untitled");
  t.is(rootItems[1]?.can_play, false);
  t.is(rootItems[1]?.can_browse, false);

  t.is(rootItems[2]?.title, "Untrimmed Album");
  t.is(rootItems[2]?.media_id, "  Untrimmed Album  ");
  t.is(rootItems[2]?.can_play, true);
  t.is(rootItems[2]?.can_browse, true);

  // 2. Nested path browse in path mode (media_id = "Library/Albums")
  const subRes = await player.browse({
    media_id: "Library/Albums",
    stable_ids: true,
    paging: new uc.Paging(1, 10)
  });
  t.true(subRes instanceof uc.BrowseResult);
  const subItems = (subRes as uc.BrowseResult).media!.items!;

  t.is(subItems[0]?.title, "Untitled");
  t.is(subItems[0]?.media_id, "Library/Albums/");
  t.is(subItems[0]?.can_play, false);
  t.is(subItems[0]?.can_browse, false);

  t.is(subItems[2]?.title, "Untrimmed Album");
  t.is(subItems[2]?.media_id, "Library/Albums/  Untrimmed Album  ");
  t.is(subItems[2]?.can_play, true);
  t.is(subItems[2]?.can_browse, true);
});

test("search: handles items with empty title", async (t) => {
  const player = createTestPlayer({
    fullTextSearch: async (): Promise<Item[]> => [
      {
        title: "",
        subtitle: "Unknown Artist",
        item_key: "999:1",
        hint: "list"
      }
    ]
  });

  const res = await player.search({
    query: "unknown",
    stable_ids: false,
    paging: new uc.Paging(1, 10)
  });

  t.true(res instanceof uc.SearchResult);
  const searchResult = res as uc.SearchResult;
  t.is(searchResult.media.length, 1);
  t.is(searchResult.media[0]?.title, "Untitled");
  t.is(searchResult.media[0]?.media_id, "999:1");
  t.is(searchResult.media[0]?.can_play, true);
  t.is(searchResult.media[0]?.can_browse, true);
});
