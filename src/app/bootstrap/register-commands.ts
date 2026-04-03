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
      .setName("leave")
      .setDescription("Leave the voice channel.")
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
