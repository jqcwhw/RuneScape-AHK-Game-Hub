import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import os from "os";
import { storage } from "./storage";
import { insertScriptSchema, insertNewsArticleSchema, insertSystemStatsSchema, insertUserSchema } from "@shared/schema";
import OpenAI from "openai";

// Initialize OpenAI client - using Replit AI Integrations (fallback to mock if not available)
let openai: OpenAI | null = null;

try {
  // Try to initialize OpenAI - Replit AI Integrations should handle credentials automatically
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } else {
    // In development/demo mode, we'll use mock responses
    console.log("OpenAI API key not found, AI generation will use mock responses");
  }
} catch (error) {
  console.log("OpenAI initialization failed, using mock AI responses");
}

// Middleware to check if user is authenticated
function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication Routes
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUserByEmail = await storage.getUserByEmail(validatedData.email);
      if (existingUserByEmail) {
        return res.status(400).json({ error: "Email already in use" });
      }
      
      const existingUserByUsername = await storage.getUserByUsername(validatedData.username);
      if (existingUserByUsername) {
        return res.status(400).json({ error: "Username already taken" });
      }
      
      // Create new user
      const user = await storage.createUser(validatedData);
      
      // Log the user in
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to login after registration" });
        }
        
        // Remove password hash from response
        const { passwordHash, ...userWithoutPassword } = user;
        res.status(201).json({ user: userWithoutPassword, message: "Registration successful" });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(400).json({ error: "Invalid registration data" });
    }
  });
  
  app.post("/api/auth/login", async (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate('local', (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ error: "Authentication failed" });
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || "Invalid credentials" });
      }
  });

  app.post("/api/scripts/:id/execute", async (req: Request, res: Response) => {
    try {
      const script = await storage.getScript(req.params.id);
      if (!script) {
        return res.status(404).json({ error: "Script not found" });
      }
      await storage.updateScript(req.params.id, { lastExecutedAt: new Date().toISOString(), executionCount: (script.executionCount || 0) + 1 });
      res.json({ success: true, message: `Script ${script.name} executed` });
    } catch (error) {
      res.status(500).json({ error: "Failed to execute script" });
    }
  });

  app.post("/api/scripts/:id/favorite", async (req: Request, res: Response) => {
    try {
      const script = await storage.getScript(req.params.id);
      if (!script) {
        return res.status(404).json({ error: "Script not found" });
      }
      await storage.updateScript(req.params.id, { isFavorite: !script.isFavorite });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update favorite" });
    }
  });

  app.delete("/api/scripts/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteScript(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Script not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete script" });
    }
  });

  // News API Routes - NO AUTH REQUIRED
  app.get("/api/news", async (req: Request, res: Response) => {
    try {
      const articles = await storage.getAllNewsArticles();
      res.json(articles);
    } catch (error) {
      console.error("Error fetching articles:", error);
      res.status(500).json({ error: "Failed to fetch news articles" });
    }
  });

  app.get("/api/news/:id", async (req: Request, res: Response) => {
    try {
      const article = await storage.getNewsArticle(req.params.id);
      if (!article) {
        return res.status(404).json({ error: "Article not found" });
      }
      res.json(article);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch article" });
    }
  });

  // System Stats API Routes - NO AUTH REQUIRED
  app.get("/api/system-stats", async (req: Request, res: Response) => {
    try {
      const mockStats = {
        cpu: Math.floor(Math.random() * 40 + 30),
        gpu: Math.floor(Math.random() * 60 + 20),
        ram: Math.floor(Math.random() * 60 + 20),
        disk: Math.floor(Math.random() * 40 + 20),
        uptime: process.uptime(),
        platform: process.platform,
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
      };
      res.json(mockStats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch system stats" });
    }
  });

  app.get("/api/system-stats/history", async (req: Request, res: Response) => {
    try {
      const history = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          time: new Date(Date.now() - i * 60000).toLocaleTimeString(),
          cpu: Math.floor(Math.random() * 40 + 30),
          ram: Math.floor(Math.random() * 60 + 20),
          gpu: Math.floor(Math.random() * 60 + 20)
        });
      }
      res.json(history.reverse());
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats history" });
    }
  });

  // Game Launcher APIs - NO AUTH REQUIRED
  interface GameAccount {
    id: string;
    name: string;
    client: 'browser' | 'launcher' | 'steam' | 'runelite';
    username?: string;
    notes?: string;
  }

  const gameAccounts: GameAccount[] = [];
  const gameSettings: any = { preferredClient: 'runelite' };

  app.get("/api/game/accounts", async (req: Request, res: Response) => {
    try {
      res.json(gameAccounts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

  app.post("/api/game/accounts", async (req: Request, res: Response) => {
    try {
      const { name, client } = req.body;
      if (!name || !client) {
        return res.status(400).json({ error: "Name and client type required" });
      }
      const account: GameAccount = {
        id: Date.now().toString(),
        name,
        client,
      };
      gameAccounts.push(account);
      res.json({ success: true, account });
    } catch (error) {
      res.status(500).json({ error: "Failed to add account" });
    }
  });

  app.delete("/api/game/accounts/:id", async (req: Request, res: Response) => {
    try {
      const index = gameAccounts.findIndex(a => a.id === req.params.id);
      if (index === -1) return res.status(404).json({ error: "Account not found" });
      gameAccounts.splice(index, 1);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  app.get("/api/game/clients/detect", async (req: Request, res: Response) => {
    try {
      const detected = [
        { type: 'browser', detected: true },
        { type: 'runelite', detected: true },
        { type: 'launcher', detected: process.platform === 'win32' },
        { type: 'steam', detected: true }
      ];
      res.json(detected);
    } catch (error) {
      res.status(500).json({ error: "Failed to detect clients" });
    }
  });

  app.post("/api/game/launch", async (req: Request, res: Response) => {
    try {
      const { accountId, client } = req.body;
      const account = accountId ? gameAccounts.find(a => a.id === accountId) : null;
      const clientType = client || gameSettings.preferredClient || 'browser';
      res.json({
        success: true,
        message: `Launching ${clientType}${account ? ` with ${account.name}` : ''}`,
        launchDetails: { client: clientType, account: account?.name || 'None', status: 'launched' }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to launch game" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
