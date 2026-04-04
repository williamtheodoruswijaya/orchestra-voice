import "dotenv/config";
import type { DiscordGatewayAdapterCreator } from "@discordjs/voice";
import { Events, GuildMember, MessageFlags } from "discord.js";
import { JoinVoiceChannel } from "../../application/use-cases/JoinVoiceChannel";
import { LeaveVoiceChannel } from "../../application/use-cases/LeaveVoiceChannel";
import { createDiscordClient } from "../../infrastructure/discord/client/createDiscordClient";
import { DiscordVoiceGateway } from "../../infrastructure/voice/DiscordVoiceGateway";
import { StartPlayback } from "../../application/use-cases/StartPlayback";
import { StopPlayback } from "../../application/use-cases/StopPlayback";
import { SearchTracks } from "../../application/use-cases/SearchTracks";
import { YouTubeCatalogAdapter } from "../../infrastructure/providers/youtube/YouTubeCatalogAdapter";

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;

  if (!token) {
    throw new Error("DISCORD_TOKEN is missing in .env");
  }

  const client = createDiscordClient();

  const voiceGateway = new DiscordVoiceGateway();
  const youtubeApiKey = process.env.YOUTUBE_API_KEY ?? "";
  const youtubeCatalog = new YouTubeCatalogAdapter(youtubeApiKey);
  const searchTracksUseCase = new SearchTracks(youtubeCatalog);
  const joinVoiceChannelUseCase = new JoinVoiceChannel(voiceGateway);
  const leaveVoiceChannelUseCase = new LeaveVoiceChannel(voiceGateway);
  const startPlaybackUseCase = new StartPlayback(voiceGateway);
  const stopPlaybackUseCase = new StopPlayback(voiceGateway);

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

        const member = interaction.member as GuildMember;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
          await interaction.editReply(
            "You need to join a voice channel first.",
          );
          return;
        }

        await joinVoiceChannelUseCase.execute({
          guildId: interaction.guildId!,
          channelId: voiceChannel.id,
          adapterCreator: voiceChannel.guild
            .voiceAdapterCreator as DiscordGatewayAdapterCreator,
        });

        await interaction.editReply(`Joined **${voiceChannel.name}**.`);
        return;
      }

      if (interaction.commandName === "play") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const member = interaction.member as GuildMember;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
          await interaction.editReply(
            "You need to join a voice channel first.",
          );
          return;
        }

        const url = interaction.options.getString("url", true);

        await joinVoiceChannelUseCase.execute({
          guildId: interaction.guildId!,
          channelId: voiceChannel.id,
          adapterCreator: voiceChannel.guild
            .voiceAdapterCreator as DiscordGatewayAdapterCreator,
        });

        await startPlaybackUseCase.execute({
          guildId: interaction.guildId!,
          url,
          title: url,
        });

        await interaction.editReply(`Started playing audio from:\n${url}`);
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
        const tracks = await searchTracksUseCase.execute(query);

        if (tracks.length === 0) {
          await interaction.editReply(`No results found for: ${query}`);
          return;
        }

        const lines = tracks.map((track, index) => {
          return `${index + 1}. **${track.title}**
Channel: ${track.artist ?? "Unknown"}
URL: ${track.pageUrl ?? "-"}`;
        });

        await interaction.editReply(lines.join("\n\n"));
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
