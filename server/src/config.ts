export const port = Number(process.env.PORT ?? 3000);

export const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const jwtSecret = process.env.JWT_SECRET ?? "development-secret-change-me";

export const appUrl = process.env.APP_URL ?? "https://finance-pro.space";
