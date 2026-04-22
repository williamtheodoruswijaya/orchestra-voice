import "dotenv/config";
import type { DiscordGatewayAdapterCreator } from "@discordjs/voice";
import {
  ChatInputCommandInteraction,
  Events,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { JoinVoiceChannel } from "../../application/use-cases/JoinVoiceChannel";
import { LeaveVoiceChannel } from "../../application/use-cases/LeaveVoiceChannel";
import { StartPlayback } from "../../application/use-cases/StartPlayback";
import { StopPlayback } from "../../application/use-cases/StopPlayback";
import { SearchTracks } from "../../application/use-cases/SearchTracks";
import { SaveSearchResults } from "../../application/use-cases/SaveSearchResults";
import { PickTrack } from "../../application/use-cases/PickTrack";
import { GetSelectedTrack } from "../../application/use-cases/GetSelectedTrack";
import { SearchProvider } from "../../application/ports/outbound/SearchSessionRepositoryPort";
import { Track } from "../../domain/entities/Track";
import { createDiscordClient } from "../../infrastructure/discord/client/createDiscordClient";
import { DiscordVoiceGateway } from "../../infrastructure/voice/DiscordVoiceGateway";
import { YtDlpStreamResolver } from "../../infrastructure/voice/YtDlpStreamResolver";
import { YouTubeCatalogAdapter } from "../../infrastructure/providers/youtube/YouTubeCatalogAdapter";
import { SpotifyCatalogAdapter } from "../../infrastructure/providers/spotify/SpotifyCatalogAdapter";
import { CompositeMusicCatalogAdapter } from "../../infrastructure/providers/CompositeMusicCatalogAdapter";
import { InMemorySearchSessionRepository } from "../../infrastructure/persistence/memory/InMemorySearchSessionRepository";
import { formatDurationMs } from "../../shared/utils/time";

const SEARCH_PROVIDERS: SearchProvider[] = ["all", "youtube", "spotify"];

function getSearchProvider(
  interaction: ChatInputCommandInteraction,
): SearchProvider {
  const provider = interaction.options.getString("provider") ?? "all";

  if (SEARCH_PROVIDERS.includes(provider as SearchProvider)) {
    return provider as SearchProvider;
  }

  return "all";
}

function formatTrackTitle(track: Track): string {
  return track.artist ? `${track.title} - ${track.artist}` : track.title;
}

function formatTrackResult(track: Track, index?: number): string {
  const prefix = index === undefined ? "" : `${index + 1}. `;
  const source = track.provider[0].toUpperCase() + track.provider.slice(1);
  const duration = formatDurationMs(track.durationMs);
  const pageUrl = track.pageUrl ? `\n${track.pageUrl}` : "";

  return `${prefix}**${formatTrackTitle(track)}**\n${source} | ${duration}${pageUrl}`;
}

async function joinMemberVoiceChannel(
  interaction: ChatInputCommandInteraction,
  joinVoiceChannelUseCase: JoinVoiceChannel,
): Promise<string | undefined> {
  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    await interaction.editReply("You need to join a voice channel first.");
    return undefined;
  }

  await joinVoiceChannelUseCase.execute({
    guildId: interaction.guildId!,
    channelId: voiceChannel.id,
    adapterCreator: voiceChannel.guild
      .voiceAdapterCreator as DiscordGatewayAdapterCreator,
  });

  return voiceChannel.name;
}

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

  const searchTrackUseCases: Record<SearchProvider, SearchTracks> = {
    all: new SearchTracks(compositeCatalog),
    youtube: new SearchTracks(youtubeCatalog),
    spotify: new SearchTracks(spotifyCatalog),
  };
  const joinVoiceChannelUseCase = new JoinVoiceChannel(voiceGateway);
  const leaveVoiceChannelUseCase = new LeaveVoiceChannel(voiceGateway);
  const startPlaybackUseCase = new StartPlayback(voiceGateway, streamResolver);
  const stopPlaybackUseCase = new StopPlayback(voiceGateway);
  const saveSearchResultsUseCase = new SaveSearchResults(searchSessions);
  const pickTrackUseCase = new PickTrack(searchSessions);
  const getSelectedTrackUseCase = new GetSelectedTrack(searchSessions);

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;

      console.log("Received interaction:", interaction.commandName);

      if (interaction.commandName === "ping") {
        await interaction.reply("Pong!");
        return;
      }

      if (!interaction.inGuild()) {
        await interaction.reply({
          content: "This command can only be used inside a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.commandName === "join") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const voiceChannelName = await joinMemberVoiceChannel(
          interaction,
          joinVoiceChannelUseCase,
        );

        if (!voiceChannelName) return;

        await interaction.editReply(`Joined **${voiceChannelName}**.`);
        return;
      }

      if (interaction.commandName === "play") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const source =
          interaction.options.getString("query") ??
          interaction.options.getString("url");

        if (!source) {
          await interaction.editReply(
            "Provide a YouTube URL, Spotify track URL, or search query.",
          );
          return;
        }

        const voiceChannelName = await joinMemberVoiceChannel(
          interaction,
          joinVoiceChannelUseCase,
        );

        if (!voiceChannelName) return;

        const resolved = await startPlaybackUseCase.execute({
          guildId: interaction.guildId!,
          source,
        });

        await interaction.editReply(
          `Now playing **${resolved.title}** in **${voiceChannelName}**.${
            resolved.sourceUrl ? `\n${resolved.sourceUrl}` : ""
          }`,
        );
        return;
      }

      if (interaction.commandName === "stop") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        await stopPlaybackUseCase.execute(interaction.guildId!);

        await interaction.editReply("Playback stopped.");
        return;
      }

      if (interaction.commandName === "leave") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        await leaveVoiceChannelUseCase.execute(interaction.guildId!);

        await interaction.editReply("Left the voice channel.");
        return;
      }

      if (interaction.commandName === "search") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const query = interaction.options.getString("query", true);
        const provider = getSearchProvider(interaction);
        const tracks = await searchTrackUseCases[provider].execute(query);

        await saveSearchResultsUseCase.execute({
          guildId: interaction.guildId!,
          query,
          provider,
          results: tracks,
        });

        if (tracks.length === 0) {
          await interaction.editReply(`No results found for: ${query}`);
          return;
        }

        await interaction.editReply(tracks.map(formatTrackResult).join("\n\n"));
        return;
      }

      if (interaction.commandName === "pick") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const number = interaction.options.getInteger("number", true);
        const track = await pickTrackUseCase.execute({
          guildId: interaction.guildId!,
          number,
        });
        const voiceChannelName = await joinMemberVoiceChannel(
          interaction,
          joinVoiceChannelUseCase,
        );

        if (!voiceChannelName) return;

        const resolved = await startPlaybackUseCase.execute({
          guildId: interaction.guildId!,
          source: track,
        });

        await interaction.editReply(
          `Picked **${formatTrackTitle(track)}** and started playback in **${voiceChannelName}**.${
            resolved.sourceUrl ? `\n${resolved.sourceUrl}` : ""
          }`,
        );
        return;
      }

      if (interaction.commandName === "selected") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const selectedTrack = await getSelectedTrackUseCase.execute(
          interaction.guildId!,
        );

        if (!selectedTrack) {
          await interaction.editReply(
            "No track is selected yet. Run /search and /pick first.",
          );
          return;
        }

        await interaction.editReply(formatTrackResult(selectedTrack));
        return;
      }
    } catch (error) {
      console.error("Interaction handler error:", error);

      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while handling the command.";

      try {
        if (interaction.isChatInputCommand()) {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(message);
          } else {
            await interaction.reply({
              content: message,
              flags: MessageFlags.Ephemeral,
            });
          }
        } else if (interaction.isRepliable()) {
          await interaction.reply({
            content: message,
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error("Failed to send interaction error response:", replyError);
      }
    }
  });

  await client.login(token);
}

main().catch((error) => {
  console.error("Application failed to start.", error);
  process.exit(1);
});
