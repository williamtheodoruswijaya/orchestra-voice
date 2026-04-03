import "dotenv/config";
import type { DiscordGatewayAdapterCreator } from "@discordjs/voice";
import { Events, GuildMember } from "discord.js";
import { JoinVoiceChannel } from "../../application/use-cases/JoinVoiceChannel";
import { LeaveVoiceChannel } from "../../application/use-cases/LeaveVoiceChannel";
import { createDiscordClient } from "../../infrastructure/discord/client/createDiscordClient";
import { DiscordVoiceGateway } from "../../infrastructure/voice/DiscordVoiceGateway";

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;

  if (!token) {
    throw new Error("DISCORD_TOKEN is missing in .env");
  }

  const client = createDiscordClient();

  const voiceGateway = new DiscordVoiceGateway();
  const joinVoiceChannelUseCase = new JoinVoiceChannel(voiceGateway);
  const leaveVoiceChannelUseCase = new LeaveVoiceChannel(voiceGateway);

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
          ephemeral: true,
        });
        return;
      }

      if (interaction.commandName === "join") {
        const member = interaction.member as GuildMember;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
          await interaction.reply({
            content: "You need to join a voice channel first.",
            ephemeral: true,
          });
          return;
        }

        await joinVoiceChannelUseCase.execute({
          guildId: interaction.guildId!,
          channelId: voiceChannel.id,
          adapterCreator: voiceChannel.guild
            .voiceAdapterCreator as DiscordGatewayAdapterCreator,
        });

        await interaction.reply({
          content: `Joined **${voiceChannel.name}**.`,
          ephemeral: true,
        });
        return;
      }

      if (interaction.commandName === "leave") {
        await leaveVoiceChannelUseCase.execute(interaction.guildId!);

        await interaction.reply({
          content: "Left the voice channel.",
          ephemeral: true,
        });
        return;
      }
    } catch (error) {
      console.error("Interaction handler error:", error);

      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "Something went wrong while handling the command.",
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: "Something went wrong while handling the command.",
            ephemeral: true,
          });
        }
      }
    }
  });

  await client.login(token);
}

main().catch((error) => {
  console.error("Application failed to start.", error);
  process.exit(1);
});
