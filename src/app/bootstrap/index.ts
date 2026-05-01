import "dotenv/config";
import { Events } from "discord.js";
import { ProviderCooldownService } from "../../application/services/ProviderCooldownService";
import { ClearQueue } from "../../application/use-cases/ClearQueue";
import { EnqueueTrack } from "../../application/use-cases/EnqueueTrack";
import { GetPlaybackSettings } from "../../application/use-cases/GetPlaybackSettings";
import { GetQueue } from "../../application/use-cases/GetQueue";
import { GetSelectedTrack } from "../../application/use-cases/GetSelectedTrack";
import { JoinVoiceChannel } from "../../application/use-cases/JoinVoiceChannel";
import { LeaveVoiceChannel } from "../../application/use-cases/LeaveVoiceChannel";
import { LoopCurrentTrack } from "../../application/use-cases/LoopCurrentTrack";
import { LoopQueue } from "../../application/use-cases/LoopQueue";
import { PausePlayback } from "../../application/use-cases/PausePlayback";
import { PickTrack } from "../../application/use-cases/PickTrack";
import { PlayNextTrack } from "../../application/use-cases/PlayNextTrack";
import { PlayNowTrack } from "../../application/use-cases/PlayNowTrack";
import { RemoveQueueItem } from "../../application/use-cases/RemoveQueueItem";
import { ResumePlayback } from "../../application/use-cases/ResumePlayback";
import { SaveSearchResults } from "../../application/use-cases/SaveSearchResults";
import { SearchTracks } from "../../application/use-cases/SearchTracks";
import { SetAutoplayMode } from "../../application/use-cases/SetAutoplayMode";
import { SetPlaybackMood } from "../../application/use-cases/SetPlaybackMood";
import { ShuffleQueue } from "../../application/use-cases/ShuffleQueue";
import { SkipTrack } from "../../application/use-cases/SkipTrack";
import { StopPlayback } from "../../application/use-cases/StopPlayback";
import { GuildPlaybackSettingsService } from "../../application/services/GuildPlaybackSettingsService";
import { PlaybackQueueService } from "../../application/services/PlaybackQueueService";
import type { SearchProvider } from "../../application/ports/outbound/SearchSessionRepositoryPort";
import { DiscordInteractionHandler } from "../../infrastructure/discord/DiscordInteractionHandler";
import { createDiscordClient } from "../../infrastructure/discord/client/createDiscordClient";
import { PinoLogger } from "../../infrastructure/logging/PinoLogger";
import { InMemoryGuildPlaybackSettingsRepository } from "../../infrastructure/persistence/memory/InMemoryGuildPlaybackSettingsRepository";
import { InMemoryGuildQueueRepository } from "../../infrastructure/persistence/memory/InMemoryGuildQueueRepository";
import { InMemorySearchSessionRepository } from "../../infrastructure/persistence/memory/InMemorySearchSessionRepository";
import { CompositeMusicCatalogAdapter } from "../../infrastructure/providers/CompositeMusicCatalogAdapter";
import { ResilientMusicCatalogAdapter } from "../../infrastructure/providers/ResilientMusicCatalogAdapter";
import { SpotifyCatalogAdapter } from "../../infrastructure/providers/spotify/SpotifyCatalogAdapter";
import { YouTubeCatalogAdapter } from "../../infrastructure/providers/youtube/YouTubeCatalogAdapter";
import { DiscordVoiceGateway } from "../../infrastructure/voice/DiscordVoiceGateway";
import { YtDlpStreamResolver } from "../../infrastructure/voice/YtDlpStreamResolver";
import { loadBotRuntimeEnv } from "./env";

async function main(): Promise<void> {
  const runtimeEnv = loadBotRuntimeEnv();
  const logger = new PinoLogger();

  const client = createDiscordClient();

  const voiceGateway = new DiscordVoiceGateway();
  const providerCooldowns = new ProviderCooldownService();
  const youtubeCatalog = new YouTubeCatalogAdapter(runtimeEnv.youtubeApiKey);
  const resilientYouTubeCatalog = new ResilientMusicCatalogAdapter(
    "youtube",
    youtubeCatalog,
    providerCooldowns,
    logger,
  );
  const spotifyCatalog = new SpotifyCatalogAdapter(
    runtimeEnv.spotifyClientId,
    runtimeEnv.spotifyClientSecret,
    runtimeEnv.spotifyMarket,
  );
  const resilientSpotifyCatalog = new ResilientMusicCatalogAdapter(
    "spotify",
    spotifyCatalog,
    providerCooldowns,
    logger,
  );
  const compositeCatalog = new CompositeMusicCatalogAdapter([
    resilientYouTubeCatalog,
    resilientSpotifyCatalog,
  ]);
  const streamResolver = new YtDlpStreamResolver({
    spotifyCatalog,
    ytDlpPath: runtimeEnv.ytDlpPath,
  });
  const searchSessions = new InMemorySearchSessionRepository();
  const queueRepository = new InMemoryGuildQueueRepository();
  const settingsRepository = new InMemoryGuildPlaybackSettingsRepository();
  const playbackQueueService = new PlaybackQueueService(
    queueRepository,
    streamResolver,
    voiceGateway,
    undefined,
    undefined,
    {
      relatedCatalog: compositeCatalog,
      playlistCatalog: resilientYouTubeCatalog,
      settingsRepository,
    },
  );
  const settingsService = new GuildPlaybackSettingsService(settingsRepository);

  const searchTracks: Record<SearchProvider, SearchTracks> = {
    all: new SearchTracks(compositeCatalog),
    youtube: new SearchTracks(resilientYouTubeCatalog),
    spotify: new SearchTracks(resilientSpotifyCatalog),
  };

  const playNextTrack = new PlayNextTrack(playbackQueueService);
  voiceGateway.onPlaybackFinished(async (guildId) => {
    try {
      const result = await playNextTrack.execute(guildId);
      if (
        result.autoplayStatus !== "not-needed" &&
        result.autoplayStatus !== "playable-continuation"
      ) {
        logger.debug("Autoplay continuation stopped cleanly.", {
          guildId,
          status: result.autoplayStatus,
          providers: result.providerStatuses?.map((status) => status.provider),
        });
      }
    } catch (error) {
      logger.error("Unexpected playback-finished continuation failure.", {
        guildId,
        error,
      });
    }
  });

  const interactionHandler = new DiscordInteractionHandler({
    joinVoiceChannel: new JoinVoiceChannel(voiceGateway),
    leaveVoiceChannel: new LeaveVoiceChannel(voiceGateway),
    searchTracks,
    saveSearchResults: new SaveSearchResults(searchSessions),
    pickTrack: new PickTrack(searchSessions),
    getSelectedTrack: new GetSelectedTrack(searchSessions),
    playNowTrack: new PlayNowTrack(playbackQueueService),
    enqueueTrack: new EnqueueTrack(playbackQueueService),
    getQueue: new GetQueue(playbackQueueService),
    loopCurrentTrack: new LoopCurrentTrack(playbackQueueService),
    loopQueue: new LoopQueue(playbackQueueService),
    skipTrack: new SkipTrack(playbackQueueService),
    clearQueue: new ClearQueue(playbackQueueService),
    removeQueueItem: new RemoveQueueItem(playbackQueueService),
    stopPlayback: new StopPlayback(playbackQueueService),
    pausePlayback: new PausePlayback(playbackQueueService),
    resumePlayback: new ResumePlayback(playbackQueueService),
    getPlaybackSettings: new GetPlaybackSettings(settingsService),
    setAutoplayMode: new SetAutoplayMode(settingsService),
    setPlaybackMood: new SetPlaybackMood(settingsService),
    shuffleQueue: new ShuffleQueue(playbackQueueService),
  });

  client.once(Events.ClientReady, (readyClient) => {
    logger.info("Discord bot logged in.", {
      userTag: readyClient.user.tag,
    });
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    await interactionHandler.handle(interaction);
  });

  await client.login(runtimeEnv.discordToken);
}

main().catch((error) => {
  console.error("Application failed to start.", error);
  process.exit(1);
});
