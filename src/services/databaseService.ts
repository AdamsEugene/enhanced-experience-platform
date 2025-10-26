import { PrismaClient } from "@prisma/client";
import { ChatbotConfig, WidgetRecommendationResponse } from "../types";

const prisma = new PrismaClient();

export class DatabaseService {
  // ============== CHATBOT CRUD OPERATIONS ==============

  /**
   * Create a new chatbot
   */
  static async createChatbot(chatbotConfig: ChatbotConfig) {
    return await prisma.chatbot.create({
      data: {
        id: chatbotConfig.id,
        name: chatbotConfig.name,
        description: chatbotConfig.description,
        personality: chatbotConfig.personality,
        capabilities: chatbotConfig.capabilities || [],
        conversationFlow: chatbotConfig.conversationFlow || {},
      },
    });
  }

  /**
   * Get a chatbot by ID
   */
  static async getChatbotById(id: string) {
    return await prisma.chatbot.findUnique({
      where: { id },
    });
  }

  /**
   * Get all chatbots
   */
  static async getAllChatbots(limit?: number, offset?: number) {
    const chatbots = await prisma.chatbot.findMany({
      take: limit,
      skip: offset,
      orderBy: {
        createdAt: "desc",
      },
    });

    const total = await prisma.chatbot.count();

    return { chatbots, total };
  }

  /**
   * Update a chatbot
   */
  static async updateChatbot(
    id: string,
    updates: Partial<Omit<ChatbotConfig, "id" | "createdAt">>
  ) {
    return await prisma.chatbot.update({
      where: { id },
      data: {
        name: updates.name,
        description: updates.description,
        personality: updates.personality,
        capabilities: updates.capabilities,
        conversationFlow: updates.conversationFlow as any,
      },
    });
  }

  /**
   * Delete a chatbot
   */
  static async deleteChatbot(id: string) {
    return await prisma.chatbot.delete({
      where: { id },
    });
  }

  /**
   * Delete all chatbots
   */
  static async deleteAllChatbots() {
    return await prisma.chatbot.deleteMany({});
  }

  // ============== WIDGET RECOMMENDATION CRUD OPERATIONS ==============

  /**
   * Create a new widget recommendation
   */
  static async createWidgetRecommendation(
    userIntent: string,
    context: string | undefined,
    recommendation: WidgetRecommendationResponse
  ) {
    return await prisma.widgetRecommendation.create({
      data: {
        userIntent,
        context: context || null,
        shortName: recommendation.shortName,
        status: "active", // Default to active
        totalPages: recommendation.totalPages,
        flowDescription: recommendation.flowDescription,
        pages: recommendation.pages as any,
      },
    });
  }

  /**
   * Get a widget recommendation by ID
   */
  static async getWidgetRecommendationById(id: string) {
    return await prisma.widgetRecommendation.findUnique({
      where: { id },
    });
  }

  /**
   * Get all widget recommendations
   */
  static async getAllWidgetRecommendations(limit?: number, offset?: number) {
    const recommendations = await prisma.widgetRecommendation.findMany({
      take: limit,
      skip: offset,
      orderBy: {
        createdAt: "desc",
      },
    });

    const total = await prisma.widgetRecommendation.count();

    return { recommendations, total };
  }

  /**
   * Update a widget recommendation
   */
  static async updateWidgetRecommendation(
    id: string,
    updates: {
      userIntent?: string;
      context?: string;
      shortName?: string;
      status?: string;
      totalPages?: number;
      flowDescription?: string;
      pages?: any;
    }
  ) {
    return await prisma.widgetRecommendation.update({
      where: { id },
      data: updates,
    });
  }

  /**
   * Delete a widget recommendation
   */
  static async deleteWidgetRecommendation(id: string) {
    return await prisma.widgetRecommendation.delete({
      where: { id },
    });
  }

  /**
   * Delete all widget recommendations
   */
  static async deleteAllWidgetRecommendations() {
    return await prisma.widgetRecommendation.deleteMany({});
  }

  // ============== CHATBOT SESSION OPERATIONS ==============

  /**
   * Create a new chatbot session
   */
  static async createChatbotSession(
    sessionId: string,
    userDescription: string,
    questions: string[]
  ) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Expire after 1 hour

    return await prisma.chatbotSession.create({
      data: {
        id: sessionId,
        userDescription,
        questions,
        expiresAt,
      },
    });
  }

  /**
   * Get a chatbot session by ID
   */
  static async getChatbotSession(sessionId: string) {
    const session = await prisma.chatbotSession.findUnique({
      where: { id: sessionId },
    });

    // Check if session is expired
    if (session && session.expiresAt < new Date()) {
      await this.deleteChatbotSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Delete a chatbot session
   */
  static async deleteChatbotSession(sessionId: string) {
    return await prisma.chatbotSession.delete({
      where: { id: sessionId },
    });
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions() {
    return await prisma.chatbotSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  }

  // ============== UTILITY METHODS ==============

  /**
   * Disconnect from database
   */
  static async disconnect() {
    await prisma.$disconnect();
  }

  /**
   * Connect to database (useful for testing connection)
   */
  static async connect() {
    await prisma.$connect();
  }
}

export default DatabaseService;
