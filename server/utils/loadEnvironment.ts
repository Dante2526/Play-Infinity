import fs from "node:fs";
import dotenv from "dotenv";

// Imported before modules which validate secrets at module initialization.
// Existing injected variables keep precedence over local files.
if (fs.existsSync(".env.local")) dotenv.config({ path: ".env.local" });
dotenv.config();
