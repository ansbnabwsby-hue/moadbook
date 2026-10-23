export type UserProfile = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  createdAt?: number;
};

export type PostMedia = {
  type: "imageData" | "imageUrl" | "videoUrl" | string;
  value: string;
};

export type FeedPost = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  postType: string;
  createdAt: number;
  hasMedia?: boolean;
  mood?: string;
  media?: PostMedia | null;
  author?: UserProfile | null;
  liked?: boolean;
  likesCount?: number;
  commentsCount?: number;
};

export type PostComment = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: number;
  postAuthorId: string;
};

export type Friendship = {
  id: string;
  requesterId: string;
  recipientId: string;
  status: "pending" | "accepted";
  createdAt: number;
};

export type Community = {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  createdAt: number;
  category?: string;
  memberCount?: number;
  joined?: boolean;
};

export type Conversation = {
  id: string;
  memberA: string;
  memberB: string;
  createdAt: number;
  updatedAt: number;
  lastMessage: string;
  lastSenderId: string;
  person?: UserProfile;
};

export type ChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: number;
  attachmentData?: string;
  attachmentName?: string;
};

export type AppNotification = {
  id: string;
  type: string;
  actorId: string;
  actorName: string;
  recipientId: string;
  createdAt: number;
  targetId: string;
  eventId?: string;
  text: string;
  read: boolean;
};

export function rows<T extends Record<string, unknown>>(value: Record<string, T> | null | undefined) {
  return Object.entries(value ?? {}).map(([id, item]) => ({ id, ...(item ?? {}) })) as Array<T & { id: string }>;
}
