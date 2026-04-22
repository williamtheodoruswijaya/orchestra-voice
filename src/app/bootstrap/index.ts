import "dotenv/config";
import { Events } from "discord.js";
import { ClearQueue } from "../../application/use-cases/ClearQueue";
import { EnqueueTrack } from "../../application/use-cases/EnqueueTrack";
import { GetNowPlaying } from "../../application/use-cases/GetNowPlaying";
import { GetQueue } from "../../application/use-cases/GetQueue";
import { GetSelectedTrack } from "../../application/use-cases/GetSelectedTrack";
import { JoinVoiceChannel } from "../../application/use-cases/JoinVoiceChannel";
import { LeaveVoiceChannel } from "../../application/use-cases/LeaveVoiceChannel";
import { PausePlayback } from "../../application/use-cases/PausePlayback";
import { PickTrack } from "../../application/use-cases/PickTrack";
import { PlayNextTrack } from "../../application/use-cases/PlayNextTrack";
import { PlayNowTrack } from "../../application/use-cases/PlayNowTrack";
import { RemoveQueueItem } from "../../application/use-cases/RemoveQueueItem";
import { ResumePlayback } from "../../application/use-cases/ResumePlayback";
import { SaveSearchResults } from "../../application/use-cases/SaveSearchResults";
import { SearchTracks } from "../../application/use-cases/SearchTracks";
import { SkipTrack } from "../../application/use-cases/SkipTrack";
import { StopPlayback } from "../../application/use-cases/StopPlayback";
import { PlaybackQueueService } from "../../application/services/PlaybackQueueService";
import type { SearchProvider } from "../../application/ports/outbound/SearchSessionRepositoryPort";
import { DiscordInteractionHandler } from "../../infrastructure/discord/DiscordInteractionHandler";
import { createDiscordClient } from "../../infrastructure/discord/client/createDiscordClient";
import { InMemoryGuildQueueRepository } from "../../infrastructure/persistence/memory/InMemoryGuildQueueRepository";
import { InMemorySearchSessionRepository } from "../../infrastructure/persistence/memory/InMemorySearchSessionRepository";
import { CompositeMusicCatalogAdapter } from "../../infrastructure/providers/CompositeMusicCatalogAdapter";
import { SpotifyCatalogAdapter } from "../../infrastructure/providers/spotify/SpotifyCatalogAdapter";
import { YouTubeCatalogAdapter } from "../../infrastructure/providers/youtube/YouTubeCatalogAdapter";
import { DiscordVoiceGateway } from "../../infrastructure/voice/DiscordVoiceGateway";
import { YtDlpStreamResolver } from "../../infrastructure/voice/YtDlpStreamResolver";

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;

  if (!token) {
    throw new Error("DISCORD_TOKEN is missing in .env");
  }

  const client = createDiscordClient();

  const voiceGateway = new DiscordVoiceGateway();
  const youtubeCatalog = new YouTubeCatalogAdapter(
    process.env.YOUTUBE_API_KEY ?? "",
  );
  const spotifyCatalog = new SpotifyCatalogAdapter(
    process.env.SPOTIFY_CLIENT_ID ?? "",
    process.env.SPOTIFY_CLIENT_SECRET ?? "",
    process.env.SPOTIFY_MARKET ?? "ID",
  );
  const compositeCatalog = new CompositeMusicCatalogAdapter([
    youtubeCatalog,
    spotifyCatalog,
  ]);
  const streamResolver = new YtDlpStreamResolver({
    spotifyCatalog,
    ytDlpPath: process.env.YT_DLP_PATH,
  });
  const searchSessions = new InMemorySearchSessionRepository();
  const queueRepository = new InMemoryGuildQueueRepository();
  const playbackQueueService = new PlaybackQueueService(
    queueRepository,
    streamResolver,
    voiceGateway,
  );

  const searchTracks: Record<SearchProvider, SearchTracks> = {
    all: new SearchTracks(compositeCatalog),
    youtube: new SearchTracks(youtubeCatalog),
    spotify: new SearchTracks(spotifyCatalog),
  };

  const playNextTrack = new PlayNextTrack(playbackQueueService);
  voiceGateway.onPlaybackFinished(async (guildId) => {
    try {
      await playNextTrack.execute(guildId);
    } catch (error) {
      console.error(`[Voice:${guildId}] Failed to autoplay next track:`, error);
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
    getNowPlaying: new GetNowPlaying(playbackQueueService),
    skipTrack: new SkipTrack(playbackQueueService),
    clearQueue: new ClearQueue(playbackQueueService),
    removeQueueItem: new RemoveQueueItem(playbackQueueService),
    stopPlayback: new StopPlayback(playbackQueueService),
    pausePlayback: new PausePlayback(playbackQueueService),
    resumePlayback: new ResumePlayback(playbackQueueService),
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    await interactionHandler.handle(interaction);
  });

  await client.login(token);
}

main().catch((error) => {
  console.error("Application failed to start.", error);
  process.exit(1);
});
