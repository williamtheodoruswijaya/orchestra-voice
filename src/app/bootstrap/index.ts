import "dotenv/config";
import { Events } from "discord.js";
import { createDiscordClient } from "../../infrastructure/discord/client/createDiscordClient";

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;

  if (!token) {
    throw new Error("DISCORD_TOKEN is missing in .env");
  }

  const client = createDiscordClient();

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    console.log("Received interaction:", interaction.commandName);

    if (interaction.commandName === "ping") {
      await interaction.reply("Pong!");
    }
  });

  await client.login(token);
}

main().catch((error) => {
  console.error("Application failed to start.", error);
  process.exit(1);
});
