import { Topic } from "encore.dev/pubsub";

export interface UserDeletedEvent {
  userId: string;
}

// Published when someone deletes their account. Each service that stores
// per-user data subscribes and erases it. A topic has no HTTP route, so
// nobody outside the app can trigger an erase for someone else.
export const userDeleted = new Topic<UserDeletedEvent>("user-deleted", {
  deliveryGuarantee: "at-least-once",
});
