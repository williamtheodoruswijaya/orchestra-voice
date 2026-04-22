export interface BotRuntimeEnv {
  discordToken: string;
  youtubeApiKey: string;
  spotifyClientId: string;
  spotifyClientSecret: string;
  spotifyMarket: string;
  ytDlpPath?: string;
}

export interface CommandRegistrationEnv {
  discordToken: string;
  discordClientId: string;
  discordGuildId: string;
}

export function loadBotRuntimeEnv(
  env: NodeJS.ProcessEnv = process.env,
): BotRuntimeEnv {
  return {
    discordToken: requireEnv(env, "DISCORD_TOKEN"),
    youtubeApiKey: env.YOUTUBE_API_KEY ?? "",
    spotifyClientId: env.SPOTIFY_CLIENT_ID ?? "",
    spotifyClientSecret: env.SPOTIFY_CLIENT_SECRET ?? "",
    spotifyMarket: env.SPOTIFY_MARKET ?? "ID",
    ytDlpPath: emptyToUndefined(env.YT_DLP_PATH),
  };
}

export function loadCommandRegistrationEnv(
  env: NodeJS.ProcessEnv = process.env,
): CommandRegistrationEnv {
  return {
    discordToken: requireEnv(env, "DISCORD_TOKEN"),
    discordClientId: requireEnv(env, "DISCORD_CLIENT_ID"),
    discordGuildId: requireEnv(env, "DISCORD_GUILD_ID"),
  };
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is missing in .env`);
  }

  return value;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
