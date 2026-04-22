import type { DiscordGatewayAdapterCreator } from "@discordjs/voice";
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  Interaction,
  MessageFlags,
} from "discord.js";
import type { JoinVoiceChannel } from "../../application/use-cases/JoinVoiceChannel";
import type { LeaveVoiceChannel } from "../../application/use-cases/LeaveVoiceChannel";
import type { SearchTracks } from "../../application/use-cases/SearchTracks";
import type { SaveSearchResults } from "../../application/use-cases/SaveSearchResults";
import type { PickTrack } from "../../application/use-cases/PickTrack";
import type { GetSelectedTrack } from "../../application/use-cases/GetSelectedTrack";
import type { PlayNowTrack } from "../../application/use-cases/PlayNowTrack";
import type { EnqueueTrack } from "../../application/use-cases/EnqueueTrack";
import type { GetQueue } from "../../application/use-cases/GetQueue";
import type { GetNowPlaying } from "../../application/use-cases/GetNowPlaying";
import type { GetPlaybackSettings } from "../../application/use-cases/GetPlaybackSettings";
import type { SkipTrack } from "../../application/use-cases/SkipTrack";
import type { ClearQueue } from "../../application/use-cases/ClearQueue";
import type { RemoveQueueItem } from "../../application/use-cases/RemoveQueueItem";
import type { StopPlayback } from "../../application/use-cases/StopPlayback";
import type { PausePlayback } from "../../application/use-cases/PausePlayback";
import type { ResumePlayback } from "../../application/use-cases/ResumePlayback";
import type { SetAutoplayMode } from "../../application/use-cases/SetAutoplayMode";
import type { SetPlaybackMood } from "../../application/use-cases/SetPlaybackMood";
import type { SearchProvider } from "../../application/ports/outbound/SearchSessionRepositoryPort";
import type { ProviderSearchStatus } from "../../application/ports/outbound/MusicCatalogPort";
import type {
  AutoplayMode,
  GuildPlaybackSettingsState,
  PlaybackMood,
} from "../../domain/entities/GuildPlaybackSettings";
import type { QueueItem, QueueState } from "../../domain/entities/GuildQueue";
import type { Track } from "../../domain/entities/Track";
import { formatDurationMs } from "../../shared/utils/time";

const SEARCH_PROVIDERS: SearchProvider[] = ["all", "youtube", "spotify"];

interface DiscordInteractionHandlerDependencies {
  joinVoiceChannel: JoinVoiceChannel;
  leaveVoiceChannel: LeaveVoiceChannel;
  searchTracks: Record<SearchProvider, SearchTracks>;
  saveSearchResults: SaveSearchResults;
  pickTrack: PickTrack;
  getSelectedTrack: GetSelectedTrack;
  playNowTrack: PlayNowTrack;
  enqueueTrack: EnqueueTrack;
  getQueue: GetQueue;
  getNowPlaying: GetNowPlaying;
  skipTrack: SkipTrack;
  clearQueue: ClearQueue;
  removeQueueItem: RemoveQueueItem;
  stopPlayback: StopPlayback;
  pausePlayback: PausePlayback;
  resumePlayback: ResumePlayback;
  getPlaybackSettings: GetPlaybackSettings;
  setAutoplayMode: SetAutoplayMode;
  setPlaybackMood: SetPlaybackMood;
}

export class DiscordInteractionHandler {
  constructor(
    private readonly dependencies: DiscordInteractionHandlerDependencies,
  ) {}

  async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    try {
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

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      switch (interaction.commandName) {
        case "join":
          await this.handleJoin(interaction);
          return;
        case "play":
          await this.handlePlay(interaction);
          return;
        case "enqueue":
          await this.handleEnqueue(interaction);
          return;
        case "queue":
          await this.handleQueue(interaction);
          return;
        case "nowplaying":
          await this.handleNowPlaying(interaction);
          return;
        case "skip":
          await this.handleSkip(interaction);
          return;
        case "clearqueue":
          await this.handleClearQueue(interaction);
          return;
        case "remove":
          await this.handleRemove(interaction);
          return;
        case "pause":
          await this.handlePause(interaction);
          return;
        case "resume":
          await this.handleResume(interaction);
          return;
        case "autoplay":
          await this.handleAutoplay(interaction);
          return;
        case "mood":
          await this.handleMood(interaction);
          return;
        case "stop":
          await this.handleStop(interaction);
          return;
        case "leave":
          await this.handleLeave(interaction);
          return;
        case "search":
          await this.handleSearch(interaction);
          return;
        case "pick":
          await this.handlePick(interaction);
          return;
        case "selected":
          await this.handleSelected(interaction);
          return;
      }
    } catch (error) {
      await this.replyWithError(interaction, error);
    }
  }

  private async handleJoin(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const voiceChannelName = await this.joinMemberVoiceChannel(interaction);

    if (!voiceChannelName) return;

    await interaction.editReply({
      embeds: [
        this.baseEmbed("Joined voice channel").setDescription(
          `Connected to **${voiceChannelName}**.`,
        ),
      ],
    });
  }

  private async handlePlay(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const source =
      interaction.options.getString("query") ??
      interaction.options.getString("url");

    if (!source) {
      await interaction.editReply(
        "Provide a YouTube URL, Spotify track URL, direct audio URL, or search query.",
      );
      return;
    }

    const voiceChannelName = await this.joinMemberVoiceChannel(interaction);

    if (!voiceChannelName) return;

    const result = await this.dependencies.playNowTrack.execute({
      guildId: interaction.guildId!,
      source,
      requestedBy: interaction.user.id,
    });

    await interaction.editReply({
      embeds: [
        this.baseEmbed(
          result.startedPlayback ? "Now playing" : "Added to queue",
        )
          .setDescription(this.formatQueueItem(result.item))
          .addFields(
            {
              name: "Voice channel",
              value: voiceChannelName,
              inline: true,
            },
            {
              name: "Queue position",
              value: result.startedPlayback
                ? "Playing now"
                : `#${result.queuePosition}`,
              inline: true,
            },
            {
              name: "Playback source",
              value: result.resolvedAudioSource.sourceUrl ?? "Resolved audio",
              inline: false,
            },
          ),
      ],
    });
  }

  private async handleEnqueue(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const voiceChannelName = await this.joinMemberVoiceChannel(interaction);

    if (!voiceChannelName) return;

    const selectedTrack = await this.dependencies.getSelectedTrack.execute(
      interaction.guildId!,
    );

    if (!selectedTrack) {
      await interaction.editReply(
        "No track is selected yet. Run `/search` and `/pick` first.",
      );
      return;
    }

    const result = await this.dependencies.enqueueTrack.execute({
      guildId: interaction.guildId!,
      track: selectedTrack,
      requestedBy: interaction.user.id,
    });

    const embed = this.baseEmbed(
      result.startedPlayback ? "Started playback" : "Added to queue",
    )
      .setDescription(this.formatQueueItem(result.item))
      .addFields({
        name: "Queue position",
        value: result.startedPlayback
          ? "Playing now"
          : `#${result.queuePosition}`,
        inline: true,
      });

    if (result.resolvedAudioSource?.sourceUrl) {
      embed.addFields({
        name: "Resolved playback source",
        value: result.resolvedAudioSource.sourceUrl,
        inline: false,
      });
    } else {
      embed.addFields({
        name: "Playback note",
        value: this.describePlaybackPath(selectedTrack),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }

  private async handleQueue(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const queue = await this.dependencies.getQueue.execute(
      interaction.guildId!,
    );

    await interaction.editReply({
      embeds: [this.formatQueueEmbed(queue)],
    });
  }

  private async handleNowPlaying(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const nowPlaying = await this.dependencies.getNowPlaying.execute(
      interaction.guildId!,
    );

    if (!nowPlaying) {
      await interaction.editReply({
        embeds: [
          this.baseEmbed("Nothing playing").setDescription(
            "The player is idle. Use `/enqueue` after selecting a track, or `/play` to start something immediately.",
          ),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        this.baseEmbed("Now playing").setDescription(
          this.formatQueueItem(nowPlaying),
        ),
      ],
    });
  }

  private async handleSkip(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    if (!(await this.ensureSameVoiceChannel(interaction))) return;

    const result = await this.dependencies.skipTrack.execute(
      interaction.guildId!,
    );

    if (!result.nextItem) {
      await interaction.editReply({
        embeds: [
          this.baseEmbed("Skipped").setDescription(
            "Skipped the current track. The queue is now empty.",
          ),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        this.baseEmbed("Skipped").setDescription(
          `Now playing:\n${this.formatQueueItem(result.nextItem)}`,
        ),
      ],
    });
  }

  private async handleClearQueue(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    if (!(await this.ensureSameVoiceChannel(interaction))) return;

    const result = await this.dependencies.clearQueue.execute(
      interaction.guildId!,
    );

    await interaction.editReply({
      embeds: [
        this.baseEmbed("Queue cleared").setDescription(
          result.removedCount === 0
            ? "There were no upcoming tracks to clear."
            : `Removed ${result.removedCount} upcoming track(s). The current track was not interrupted.`,
        ),
      ],
    });
  }

  private async handleRemove(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    if (!(await this.ensureSameVoiceChannel(interaction))) return;

    const position = interaction.options.getInteger("position", true);
    const result = await this.dependencies.removeQueueItem.execute({
      guildId: interaction.guildId!,
      position,
    });

    await interaction.editReply({
      embeds: [
        this.baseEmbed("Removed from queue").setDescription(
          this.formatQueueItem(result.removedItem),
        ),
      ],
    });
  }

  private async handlePause(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    if (!(await this.ensureSameVoiceChannel(interaction))) return;

    await this.dependencies.pausePlayback.execute(interaction.guildId!);
    await interaction.editReply({
      embeds: [
        this.baseEmbed("Paused").setDescription("Playback is paused."),
      ],
    });
  }

  private async handleResume(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    if (!(await this.ensureSameVoiceChannel(interaction))) return;

    await this.dependencies.resumePlayback.execute(interaction.guildId!);
    await interaction.editReply({
      embeds: [
        this.baseEmbed("Resumed").setDescription("Playback has resumed."),
      ],
    });
  }

  private async handleAutoplay(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const mode = interaction.options.getString("mode", true) as
      | AutoplayMode
      | "status";
    const settings =
      mode === "status"
        ? await this.dependencies.getPlaybackSettings.execute(
            interaction.guildId!,
          )
        : await this.dependencies.setAutoplayMode.execute({
            guildId: interaction.guildId!,
            mode,
          });

    await interaction.editReply({
      embeds: [
        this.formatSettingsEmbed(settings).setTitle(
          mode === "status" ? "Autoplay status" : "Autoplay updated",
        ),
      ],
    });
  }

  private async handleMood(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const mood = interaction.options.getString("preset", true) as
      | PlaybackMood
      | "status";
    const settings =
      mood === "status"
        ? await this.dependencies.getPlaybackSettings.execute(
            interaction.guildId!,
          )
        : await this.dependencies.setPlaybackMood.execute({
            guildId: interaction.guildId!,
            mood,
          });

    await interaction.editReply({
      embeds: [
        this.formatSettingsEmbed(settings).setTitle(
          mood === "status" ? "Mood status" : "Mood updated",
        ),
      ],
    });
  }

  private async handleStop(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    if (!(await this.ensureSameVoiceChannel(interaction))) return;

    await this.dependencies.stopPlayback.execute(interaction.guildId!);
    await interaction.editReply({
      embeds: [
        this.baseEmbed("Stopped").setDescription(
          "Playback stopped. Upcoming queue items were kept.",
        ),
      ],
    });
  }

  private async handleLeave(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    if (!(await this.ensureSameVoiceChannel(interaction))) return;

    await this.dependencies.stopPlayback.execute(interaction.guildId!);
    await this.dependencies.leaveVoiceChannel.execute(interaction.guildId!);
    await interaction.editReply({
      embeds: [
        this.baseEmbed("Left voice channel").setDescription(
          "Disconnected and stopped playback state.",
        ),
      ],
    });
  }

  private async handleSearch(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const query = interaction.options.getString("query", true);
    const provider = this.getSearchProvider(interaction);
    const searchResult =
      await this.dependencies.searchTracks[provider].executeDetailed(query);
    const { tracks, providerStatuses } = searchResult;

    await this.dependencies.saveSearchResults.execute({
      guildId: interaction.guildId!,
      query,
      provider,
      results: tracks,
    });

    if (tracks.length === 0) {
      const providerNote = this.formatProviderStatusNote(providerStatuses);
      await interaction.editReply({
        embeds: [
          this.baseEmbed("No results").setDescription(
            providerNote
              ? `${providerNote}\n\nNo ${provider} metadata results were saved for **${query}**.`
              : `No ${provider} metadata results found for **${query}**.`,
          ),
        ],
      });
      return;
    }

    const embed = this.formatSearchEmbed(query, provider, tracks);
    const providerNote = this.formatProviderStatusNote(providerStatuses);
    if (providerNote) {
      embed.addFields({
        name: "Provider note",
        value: providerNote,
      });
    }

    await interaction.editReply({
      embeds: [embed],
    });
  }

  private async handlePick(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const number = interaction.options.getInteger("number", true);
    const track = await this.dependencies.pickTrack.execute({
      guildId: interaction.guildId!,
      number,
    });

    await interaction.editReply({
      embeds: [
        this.baseEmbed("Selected track")
          .setDescription(this.formatTrack(track))
          .addFields({
            name: "Playback note",
            value: this.describePlaybackPath(track),
            inline: false,
          }),
      ],
    });
  }

  private async handleSelected(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const selectedTrack = await this.dependencies.getSelectedTrack.execute(
      interaction.guildId!,
    );

    if (!selectedTrack) {
      await interaction.editReply({
        embeds: [
          this.baseEmbed("No selected track").setDescription(
            "Run `/search`, then `/pick number:<n>` to select a metadata result.",
          ),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        this.baseEmbed("Selected track")
          .setDescription(this.formatTrack(selectedTrack))
          .addFields({
            name: "Playback note",
            value: this.describePlaybackPath(selectedTrack),
            inline: false,
          }),
      ],
    });
  }

  private async joinMemberVoiceChannel(
    interaction: ChatInputCommandInteraction,
  ): Promise<string | undefined> {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      await interaction.editReply("You need to join a voice channel first.");
      return undefined;
    }

    const botVoiceChannelId = interaction.guild?.members.me?.voice.channelId;
    if (botVoiceChannelId && botVoiceChannelId !== voiceChannel.id) {
      await interaction.editReply(
        "I am already connected to another voice channel in this server. Join that channel first, or ask me to leave.",
      );
      return undefined;
    }

    await this.dependencies.joinVoiceChannel.execute({
      guildId: interaction.guildId!,
      channelId: voiceChannel.id,
      adapterCreator: voiceChannel.guild
        .voiceAdapterCreator as DiscordGatewayAdapterCreator,
    });

    return voiceChannel.name;
  }

  private async ensureSameVoiceChannel(
    interaction: ChatInputCommandInteraction,
  ): Promise<boolean> {
    const botVoiceChannelId = interaction.guild?.members.me?.voice.channelId;

    if (!botVoiceChannelId) {
      return true;
    }

    const member = interaction.member as GuildMember;
    const memberVoiceChannelId = member.voice.channelId;

    if (!memberVoiceChannelId) {
      await interaction.editReply(
        "You need to join my voice channel before managing playback.",
      );
      return false;
    }

    if (memberVoiceChannelId !== botVoiceChannelId) {
      await interaction.editReply(
        "You need to be in the same voice channel as me before managing playback.",
      );
      return false;
    }

    return true;
  }

  private getSearchProvider(
    interaction: ChatInputCommandInteraction,
  ): SearchProvider {
    const provider = interaction.options.getString("provider") ?? "all";

    if (SEARCH_PROVIDERS.includes(provider as SearchProvider)) {
      return provider as SearchProvider;
    }

    return "all";
  }

  private formatSearchEmbed(
    query: string,
    provider: SearchProvider,
    tracks: Track[],
  ): EmbedBuilder {
    return this.baseEmbed("Search results")
      .setDescription(`Metadata results for **${query}** from **${provider}**.`)
      .addFields(
        tracks.map((track, index) => ({
          name: `${index + 1}. ${this.formatTrackTitle(track)}`,
          value: `${this.formatTrackDetails(track)}\n${this.describePlaybackPath(track)}`,
        })),
      );
  }

  private formatQueueEmbed(queue: QueueState): EmbedBuilder {
    const embed = this.baseEmbed("Queue");

    if (!queue.current && queue.upcoming.length === 0) {
      return embed.setDescription(
        "The queue is empty. Use `/search`, `/pick`, and `/enqueue` to add a selected metadata result. I will stay connected unless you use `/leave`.",
      );
    }

    if (queue.current) {
      embed.addFields({
        name: `Now playing (${queue.status})`,
        value: this.formatQueueItem(queue.current),
      });
    } else {
      embed.addFields({
        name: "Now playing",
        value: "Nothing is currently playing.",
      });
    }

    if (queue.upcoming.length > 0) {
      const visibleUpcoming = queue.upcoming.slice(0, 10);
      const hiddenCount = queue.upcoming.length - visibleUpcoming.length;
      embed.addFields({
        name: "Up next",
        value: visibleUpcoming
          .map((item, index) => `${index + 1}. ${this.formatQueueItem(item)}`)
          .join("\n\n")
          .concat(hiddenCount > 0 ? `\n\n...and ${hiddenCount} more.` : ""),
      });
    } else {
      embed.addFields({
        name: "Up next",
        value: "No upcoming tracks.",
      });
    }

    return embed;
  }

  private formatQueueItem(item: QueueItem): string {
    const requestedBy = item.requestedBy ? `\nRequested by <@${item.requestedBy}>` : "";
    return `${this.formatTrack(item.track)}${requestedBy}`;
  }

  private formatTrack(track: Track): string {
    const link = track.pageUrl ? `\n${track.pageUrl}` : "";
    return `**${this.formatTrackTitle(track)}**\n${this.formatTrackDetails(track)}${link}`;
  }

  private formatTrackDetails(track: Track): string {
    return `${this.formatProvider(track)} metadata | ${formatDurationMs(track.durationMs)}`;
  }

  private formatTrackTitle(track: Track): string {
    return track.artist ? `${track.title} - ${track.artist}` : track.title;
  }

  private formatProvider(track: Track): string {
    return track.provider[0].toUpperCase() + track.provider.slice(1);
  }

  private formatSettingsEmbed(settings: GuildPlaybackSettingsState): EmbedBuilder {
    return this.baseEmbed("Playback settings")
      .setDescription(
        "These settings are scoped to this server. No idle auto-leave is enabled by default.",
      )
      .addFields(
        {
          name: "Autoplay",
          value:
            settings.autoplayMode === "related"
              ? "Related-track continuation is on."
              : "Related-track continuation is off.",
          inline: false,
        },
        {
          name: "Mood",
          value: settings.mood,
          inline: true,
        },
      );
  }

  private formatProviderStatusNote(
    providerStatuses: ProviderSearchStatus[],
  ): string | undefined {
    const failed = providerStatuses.filter(
      (status) => status.status === "failed",
    );
    const skipped = providerStatuses.filter(
      (status) => status.status === "skipped",
    );
    const notes: string[] = [];

    if (failed.length > 0) {
      notes.push(
        `${this.formatProviderNames(
          failed.map((status) => status.provider),
        )} temporarily unavailable (${failed
          .map((status) => this.formatFailureReason(status.failure.reason))
          .join(", ")}).`,
      );
    }

    if (skipped.length > 0) {
      notes.push(
        `${this.formatProviderNames(
          skipped.map((status) => status.provider),
        )} on cooldown after ${skipped
          .map((status) => this.formatFailureReason(status.failureReason))
          .join(", ")}.`,
      );
    }

    return notes.length > 0 ? notes.join("\n") : undefined;
  }

  private formatProviderNames(providers: string[]): string {
    const names = [...new Set(providers)].map(
      (provider) => provider[0].toUpperCase() + provider.slice(1),
    );

    if (names.length === 0) return "Provider";
    if (names.length === 1) return names[0];

    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }

  private formatFailureReason(reason: string): string {
    return reason.replace(/-/g, " ");
  }

  private describePlaybackPath(track: Track): string {
    if (track.provider === "direct") {
      return "Direct sources are treated as playable URLs after URL validation.";
    }

    if (track.provider === "youtube") {
      return "YouTube search results are metadata. Playback requires the explicit stream resolver; the watch page itself is not direct audio.";
    }

    return "Spotify results are metadata only. Playback requires resolving a separate playable source; Spotify track pages are not direct audio.";
  }

  private baseEmbed(title: string): EmbedBuilder {
    return new EmbedBuilder().setTitle(title).setColor(0x2f80ed);
  }

  private async replyWithError(
    interaction: Interaction,
    error: unknown,
  ): Promise<void> {
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
}
