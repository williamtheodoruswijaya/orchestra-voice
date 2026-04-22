import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token) {
    throw new Error("DISCORD_TOKEN is missing in .env");
  }

  if (!clientId) {
    throw new Error("DISCORD_CLIENT_ID is missing in .env");
  }

  if (!guildId) {
    throw new Error("DISCORD_GUILD_ID is missing in .env");
  }

  const commands = [
    new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Check whether the bot is responding!")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("join")
      .setDescription("Join the voice channel you are currently in.")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("play")
      .setDescription("Play music from YouTube, Spotify, or search text")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription(
            "YouTube URL, Spotify track URL, direct audio URL, or song search",
          )
          .setRequired(true),
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName("leave")
      .setDescription("Leave the voice channel.")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("stop")
      .setDescription("Stop the current playback")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("search")
      .setDescription("Search tracks from YouTube, Spotify, or both")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Song title, artist, or keywords")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("provider")
          .setDescription("Search provider")
          .setRequired(false)
          .addChoices(
            { name: "All", value: "all" },
            { name: "YouTube", value: "youtube" },
            { name: "Spotify", value: "spotify" },
          ),
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName("pick")
      .setDescription("Select a metadata result from your latest search")
      .addIntegerOption((option) =>
        option
          .setName("number")
          .setDescription("Result number to pick")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(10),
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName("selected")
      .setDescription("Show the currently selected track")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("enqueue")
      .setDescription("Add the selected track to the playback queue")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("queue")
      .setDescription("Show the current queue")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("nowplaying")
      .setDescription("Show the current track")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("skip")
      .setDescription("Skip the current track")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("clearqueue")
      .setDescription("Clear upcoming queue items without stopping playback")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("remove")
      .setDescription("Remove an upcoming item from the queue")
      .addIntegerOption((option) =>
        option
          .setName("position")
          .setDescription("Upcoming queue position to remove")
          .setRequired(true)
          .setMinValue(1),
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName("pause")
      .setDescription("Pause current playback")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("resume")
      .setDescription("Resume paused playback")
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(token);

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commands,
  });

  console.log("Guild slash commands registered successfully.");
}

main().catch((error) => {
  console.error("Failed to register slash commands.", error);
  process.exit(1);
});
