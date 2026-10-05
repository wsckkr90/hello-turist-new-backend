import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { prisma } from "../../core/prisma";

function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function registerUser(input: {
  name: string;
  username: string;
  email?: string;
  password: string;
}) {
  const name = input.name.trim();
  const username = input.username.trim().toLowerCase();
  const email = input.email?.trim().toLowerCase();

  const existingUsername = await prisma.user.findUnique({
    where: {
      username,
    },
  });

  if (existingUsername) {
    throw new Error("USERNAME_ALREADY_EXISTS");
  }

  if (email) {
    const existingEmail = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingEmail) {
      throw new Error("EMAIL_ALREADY_EXISTS");
    }
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.user.create({
    data: {
      name,
      username,
      email,
      passwordHash,
    },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      status: true,
      preferredLanguage: true,
      createdAt: true,
    },
  });

  return user;
}

export async function loginUser(input: {
  identifier: string;
  password: string;
}) {
  const identifier = input.identifier.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        {
          username: identifier,
        },
        {
          email: identifier,
        },
      ],
    },
  });

  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const passwordMatches = await bcrypt.compare(
    input.password,
    user.passwordHash
  );

  if (!passwordMatches) {
    throw new Error("INVALID_CREDENTIALS");
  }

  if (user.status !== "ACTIVE") {
    throw new Error("ACCOUNT_NOT_ACTIVE");
  }

  const accessToken = jwt.sign(
    {
      sub: user.id,
      username: user.username,
    },
    process.env.ACCESS_TOKEN_SECRET!,
    {
      expiresIn: "15m",
    }
  );

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);

  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  );

  await prisma.refreshSession.create({
    data: {
      tokenHash: refreshTokenHash,
      userId: user.id,
      expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      status: user.status,
      preferredLanguage: user.preferredLanguage,
    },
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);

  const session = await prisma.refreshSession.findUnique({
    where: {
      tokenHash,
    },
    include: {
      user: true,
    },
  });

  if (!session) {
    throw new Error("INVALID_REFRESH_TOKEN");
  }

  if (session.revokedAt) {
    // A reused refresh token may be presented repeatedly by a client while it
    // is retrying. The token hash is the primary key, so recording the same
    // reuse event must be idempotent instead of throwing P2002 on every retry.
    await prisma.refreshTokenReuse.upsert({
      where: { tokenHash },
      update: {},
      create: { tokenHash },
    });

    throw new Error("REFRESH_TOKEN_REVOKED");
  }

  if (session.expiresAt <= new Date()) {
    throw new Error("REFRESH_TOKEN_EXPIRED");
  }

  if (session.user.status !== "ACTIVE") {
    throw new Error("ACCOUNT_NOT_ACTIVE");
  }

  const newAccessToken = jwt.sign(
    {
      sub: session.user.id,
      username: session.user.username,
    },
    process.env.ACCESS_TOKEN_SECRET!,
    {
      expiresIn: "15m",
    }
  );

  const newRefreshToken = generateRefreshToken();
  const newRefreshTokenHash = hashToken(newRefreshToken);

  const newExpiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  );

  await prisma.$transaction(async (tx) => {
    await tx.refreshSession.update({
      where: {
        id: session.id,
      },
      data: {
        revokedAt: new Date(),
        replacedByHash: newRefreshTokenHash,
      },
    });

    await tx.refreshSession.create({
      data: {
        tokenHash: newRefreshTokenHash,
        userId: session.user.id,
        expiresAt: newExpiresAt,
      },
    });
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

export async function logoutUser(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);

  const session = await prisma.refreshSession.findUnique({
    where: {
      tokenHash,
    },
  });

  if (!session) {
    throw new Error("INVALID_REFRESH_TOKEN");
  }

 if (session.revokedAt) {
  await prisma.$transaction(async (tx) => {
    await tx.refreshTokenReuse.upsert({
      where: {
        tokenHash,
      },
      update: {},
      create: {
        tokenHash,
      },
    });

    await tx.refreshSession.updateMany({
      where: {
        userId: session.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  });

  throw new Error("REFRESH_TOKEN_REVOKED");
}

  return true;
}

export async function logoutAllUserSessions(userId: string) {
  await prisma.refreshSession.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return true;
}

export async function deleteUserAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  if (user.status === "DELETED") {
    throw new Error("ACCOUNT_ALREADY_DELETED");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: {
        id: userId,
      },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
      },
    });

    await tx.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  });

  return true;
}

export async function registerTestDriver(input: {
  name: string;
  username: string;
  email?: string;
  password: string;
}) {
  const user = await registerUser(input);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.create({
        data: {
          userId: user.id,
          role: "DRIVER",
          verificationStatus: "PENDING",
        },
      });

      await tx.driverProfile.create({
        data: {
          userId: user.id,
          serviceCity: "Kurukshetra",
          serviceArea: "Kurukshetra",
          isAvailable: false,
        },
      });
    });
  } catch (error) {
    await prisma.user.delete({ where: { id: user.id } });
    throw error;
  }

  return {
    ...user,
    role: "DRIVER",
    verificationStatus: "PENDING",
  };
}
