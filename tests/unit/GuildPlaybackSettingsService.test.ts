import { describe, expect, it } from "vitest";
import { GuildPlaybackSettingsService } from "../../src/application/services/GuildPlaybackSettingsService";
import { InMemoryGuildPlaybackSettingsRepository } from "../../src/infrastructure/persistence/memory/InMemoryGuildPlaybackSettingsRepository";

describe("GuildPlaybackSettingsService", () => {
  it("defaults to related autoplay off and balanced mood", async () => {
    const service = new GuildPlaybackSettingsService(
      new InMemoryGuildPlaybackSettingsRepository(),
    );

    await expect(service.getSettings("guild-a")).resolves.toMatchObject({
      autoplayMode: "off",
      mood: "balanced",
    });
  });

  it("keeps autoplay and mood settings isolated per guild", async () => {
    const service = new GuildPlaybackSettingsService(
      new InMemoryGuildPlaybackSettingsRepository(),
    );

    await service.setAutoplay("guild-a", "related");
    await service.setMood("guild-a", "focus");
    await service.setMood("guild-b", "upbeat");

    await expect(service.getSettings("guild-a")).resolves.toMatchObject({
      autoplayMode: "related",
      mood: "focus",
    });
    await expect(service.getSettings("guild-b")).resolves.toMatchObject({
      autoplayMode: "off",
      mood: "upbeat",
    });
  });
});
