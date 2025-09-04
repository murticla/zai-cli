/** biome-ignore-all lint/style/noProcessEnv: temp */
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  API_BASE_URL: z.string().url().default("http://localhost:3001"),
  ZAI_API_KEY: z.string(),
});

function loadEnv() {
  const processEnv = process.env;

  const env = {
    API_BASE_URL: processEnv.API_BASE_URL,
    ZAI_API_KEY: processEnv.ZAI_API_KEY,
  };

  try {
    const parsed = envSchema.parse(env);
    return parsed;
  } catch (error) {
    console.error("❌ Environment validation failed:");
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        console.error(`  ${err.path.join(".")}: ${err.message}`);
      });
    }
    process.exit(1);
  }
}

export const env = loadEnv();
