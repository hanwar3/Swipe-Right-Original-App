import { api, APIError } from "encore.dev/api";
import { authDB } from "./db";
import type { User } from "./register";

export interface GetAllUsersResponse {
  users: User[];
  totalCount: number;
}

// Retrieves all registered users. Useful for long-term administration and management.
export const getAllUsers = api<void, GetAllUsersResponse>(
  { expose: true, method: "GET", path: "/auth/users" },
  async () => {
    try {
      const usersRows = await authDB.queryAll`
        SELECT user_id, email, first_name, last_name, profile_picture_url,
               auth_provider, email_verified, created_at, last_login
        FROM users
        ORDER BY created_at DESC
      `;

      const users: User[] = usersRows.map(row => ({
        userId: row.user_id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        profilePictureUrl: row.profile_picture_url,
        authProvider: row.auth_provider,
        emailVerified: row.email_verified,
        createdAt: row.created_at.toISOString(),
        lastLogin: row.last_login ? row.last_login.toISOString() : undefined
      }));

      return {
        users,
        totalCount: users.length
      };
    } catch (error) {
      console.error('Error fetching all users:', error);
      throw APIError.internal("Failed to retrieve users database.");
    }
  }
);
