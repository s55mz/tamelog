import jwt from "jsonwebtoken";

import { jwtSecret } from "../config";

type UserRole = "ADMIN" | "USER";
type UserStatus = "ACTIVE" | "SUSPENDED";

type AuthTokenPayload = {
  sub: string;
  role: UserRole;
  email: string;
};

export function createAuthToken(user: { id: string; role: UserRole; email: string }) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email
    },
    jwtSecret,
    {
      expiresIn: "7d"
    }
  );
}

export function verifyAuthToken(token: string) {
  return jwt.verify(token, jwtSecret) as AuthTokenPayload;
}

export function serializeUser(user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  setupCompleted: boolean;
  paydayOfMonth: number;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    setupCompleted: user.setupCompleted,
    paydayOfMonth: user.paydayOfMonth
  };
}
