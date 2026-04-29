import { afterEach, describe, expect, it, vi } from "vitest";
import { YouTubeCatalogAdapter } from "../../src/infrastructure/providers/youtube/YouTubeCatalogAdapter";

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as Response;
}

describe("YouTubeCatalogAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches every page of a YouTube playlist as metadata tracks", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          nextPageToken: "page-2",
          items: [
            {
              contentDetails: { videoId: "video-a" },
              snippet: {
                title: "Playlist Song A",
                videoOwnerChannelTitle: "Artist A",
                thumbnails: { high: { url: "https://img.example/a.jpg" } },
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              contentDetails: { videoId: "video-b" },
              snippet: {
                title: "Playlist Song B",
                channelTitle: "Artist B",
                thumbnails: { medium: { url: "https://img.example/b.jpg" } },
              },
            },
          ],
        }),
      );
    const adapter = new YouTubeCatalogAdapter("youtube-api-key");

    const result = await adapter.getPlaylist!(
      "https://www.youtube.com/playlist?list=PL123",
    );

    expect(result?.sourceUrl).toBe(
      "https://www.youtube.com/playlist?list=PL123",
    );
    expect(result?.tracks.map((track) => track.title)).toEqual([
      "Playlist Song A",
      "Playlist Song B",
    ]);
    expect(result?.tracks.map((track) => track.pageUrl)).toEqual([
      "https://www.youtube.com/watch?v=video-a",
      "https://www.youtube.com/watch?v=video-b",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      new URL(fetchMock.mock.calls[0][0] as string).searchParams.get(
        "pageToken",
      ),
    ).toBeNull();
    expect(
      new URL(fetchMock.mock.calls[1][0] as string).searchParams.get(
        "pageToken",
      ),
    ).toBe("page-2");
  });

  it("ignores sources that are not YouTube playlist links", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const adapter = new YouTubeCatalogAdapter("youtube-api-key");

    const result = await adapter.getPlaylist!("https://example.com/audio.mp3");

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
