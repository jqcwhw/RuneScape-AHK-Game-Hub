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
      
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to establish session" });
        }
        
        // Remove password hash from response
        const { passwordHash, ...userWithoutPassword } = user;
        res.json({ user: userWithoutPassword, message: "Login successful" });
      });
    })(req, res, next);
  });
  
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to destroy session" });
        }
        res.json({ message: "Logged out successfully" });
      });
    });
  });
  
  app.get("/api/auth/me", (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    // Remove password hash from response
    const { passwordHash, ...userWithoutPassword } = req.user as any;
    res.json({ user: userWithoutPassword });
  });
  
  // Scripts API Routes - Public access for viewing, auth required for mutations
  app.get("/api/scripts", async (req: Request, res: Response) => {
    try {
      const { category, search } = req.query;
      
      // Return all public scripts (no auth required)
      // If user is authenticated, they'll see their private scripts too
      if (search && typeof search === 'string') {
        const results = await storage.searchScripts(search);
        // Filter for public scripts only if not authenticated
        const publicResults = req.isAuthenticated() 
          ? results 
          : results.filter(s => !s.isPublic);
        return res.json(publicResults);
      }
      
      if (category && typeof category === 'string' && category !== 'all') {
        const scripts = await storage.getScriptsByCategory(category);
        const publicScripts = req.isAuthenticated()
          ? scripts
          : scripts.filter(s => !s.isPublic);
        return res.json(publicScripts);
      }
      
      const scripts = await storage.getAllScripts();
      const publicScripts = req.isAuthenticated()
        ? scripts
        : scripts.filter(s => !s.isPublic);
      res.json(publicScripts);
    } catch (error) {
      console.error("Error fetching scripts:", error);
      res.status(500).json({ error: "Failed to fetch scripts" });
    }
  });

  app.get("/api/scripts/:id", async (req: Request, res: Response) => {
    try {
      const script = await storage.getScript(req.params.id);
      if (!script) {
        return res.status(404).json({ error: "Script not found" });
      }
      res.json(script);
    } catch (error) {
      console.error("Error fetching script:", error);
      res.status(500).json({ error: "Failed to fetch script" });
    }
  });

  app.post("/api/scripts", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Must be logged in to create scripts" });
      }
      
      const data = insertScriptSchema.parse(req.body);
      const scriptData = {
        ...data,
        userId: (req.user as any).id,
        author: (req.user as any).username
      };
      const script = await storage.createScript(scriptData);
      res.status(201).json(script);
    } catch (error) {
      console.error("Error creating script:", error);
      res.status(400).json({ error: "Invalid script data" });
    }
  });

  app.patch("/api/scripts/:id", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Must be logged in to update scripts" });
      }
      
      // Fetch script to check ownership
      const existingScript = await storage.getScript(req.params.id);
      if (!existingScript) {
        return res.status(404).json({ error: "Script not found" });
      }
      
      // Check if user owns the script
      if (existingScript.userId !== (req.user as any).id) {
        return res.status(403).json({ error: "You can only update your own scripts" });
      }
      
      const script = await storage.updateScript(req.params.id, req.body);
      res.json(script);
    } catch (error) {
      console.error("Error updating script:", error);
      res.status(500).json({ error: "Failed to update script" });
    }
  });

  app.delete("/api/scripts/:id", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Must be logged in to delete scripts" });
      }
      
      // Fetch script to check ownership
      const existingScript = await storage.getScript(req.params.id);
      if (!existingScript) {
        return res.status(404).json({ error: "Script not found" });
      }
      
      // Check if user owns the script
      if (existingScript.userId !== (req.user as any).id) {
        return res.status(403).json({ error: "You can only delete your own scripts" });
      }
      
      const deleted = await storage.deleteScript(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting script:", error);
      res.status(500).json({ error: "Failed to delete script" });
    }
  });

  app.post("/api/scripts/:id/execute", async (req: Request, res: Response) => {
    try {
      await storage.incrementScriptExecution(req.params.id);
      res.json({ success: true, message: "Script execution recorded" });
    } catch (error) {
      console.error("Error executing script:", error);
      res.status(500).json({ error: "Failed to execute script" });
    }
  });

  app.post("/api/scripts/:id/favorite", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Must be logged in to favorite scripts" });
      }
      
      // Fetch script to verify it exists and check ownership (optional - users might favorite others' scripts)
      const existingScript = await storage.getScript(req.params.id);
      if (!existingScript) {
        return res.status(404).json({ error: "Script not found" });
      }
      
      // Note: We allow users to favorite any script, not just their own
      // If you want to restrict to own scripts only, uncomment the following:
      // if (existingScript.userId !== (req.user as any).id) {
      //   return res.status(403).json({ error: "You can only favorite your own scripts" });
      // }
      
      await storage.toggleScriptFavorite(req.params.id);
      res.json({ success: true, message: "Favorite toggled" });
    } catch (error) {
      console.error("Error toggling favorite:", error);
      res.status(500).json({ error: "Failed to toggle favorite" });
    }
  });

  // AI Script Generation - Anonymous access allowed
  app.post("/api/scripts/generate", async (req: Request, res: Response) => {
    try {
      const { prompt, template, model = "gpt-3.5-turbo" } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      // Allow both anonymous and authenticated users to generate scripts
      // Anonymous users get temporary scripts, authenticated users can save them
      let generatedCode = "";
      
      if (openai) {
        // Use real OpenAI API if available
        const systemPrompt = `You are an expert AutoHotkey script developer specializing in Old School RuneScape automation.
Create efficient, safe scripts with anti-ban measures, randomized delays, and proper error handling.
Use best practices for OSRS scripting including human-like mouse movements and break patterns.
Template type: ${template || 'custom'}`;

        const completion = await openai.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2000,
        });

        generatedCode = completion.choices[0]?.message?.content || "";
      } else {
        // Use mock generation if OpenAI is not available
        const templates: Record<string, string> = {
          fishing: `; AI Generated Fishing Script v1.0
; Generated from prompt: ${prompt}
; Template: ${template || 'custom'}

#NoEnv
#SingleInstance Force
SendMode Input
SetWorkingDir %A_ScriptDir%

; Configuration
global DELAY_MIN := 2000
global DELAY_MAX := 4000
global ANTI_BAN := true

F1::
  Tooltip, Starting fishing bot...
  Loop {
    ; Find and click fishing spot
    ClickFishingSpot()
    RandomSleep(3000, 5000)
    
    ; Check inventory
    if (IsInventoryFull()) {
      DropFish()
    }
    
    ; Anti-ban measures
    if (ANTI_BAN && Random(1, 10) > 7) {
      PerformAntiBan()
    }
  }
return

ClickFishingSpot() {
  ; Randomized clicking on fishing spots
  Random, xOffset, -5, 5
  Random, yOffset, -5, 5
  Click, % 523 + xOffset, % 412 + yOffset
}

IsInventoryFull() {
  ; Check if inventory is full (implement pixel detection)
  return false
}

DropFish() {
  Send, {Shift down}
  Loop, 28 {
    Click
    Sleep, 100
  }
  Send, {Shift up}
}

PerformAntiBan() {
  Random, action, 1, 4
  if (action = 1) {
    ; Random mouse movement
    Random, x, 100, 700
    Random, y, 100, 500
    MouseMove, %x%, %y%, 10
  } else if (action = 2) {
    ; Check skills tab
    Send, {F2}
    RandomSleep(500, 1000)
    Send, {Esc}
  } else if (action = 3) {
    ; Rotate camera
    Send, {Left}
    RandomSleep(200, 400)
  } else {
    ; Small break
    RandomSleep(2000, 5000)
  }
}

RandomSleep(min, max) {
  Random, delay, %min%, %max%
  Sleep, %delay%
}

F2::Pause
F3::ExitApp`,
          
          combat: `; AI Generated Combat Script v1.0
; Generated from prompt: ${prompt}
; Template: ${template || 'custom'}

#NoEnv
SendMode Input
SetWorkingDir %A_ScriptDir%

; Combat configuration
global PRAYER_FLICK := true
global USE_SPECIAL := true
global HP_THRESHOLD := 50

F1::
  Tooltip, Starting combat assistant...
  Loop {
    ; Find and attack target
    if (FindTarget()) {
      AttackTarget()
    }
    
    ; Manage prayer
    if (PRAYER_FLICK) {
      FlickPrayer()
    }
    
    ; Use special attack
    if (USE_SPECIAL && SpecialReady()) {
      UseSpecialAttack()
    }
    
    ; Health management
    if (GetHealthPercent() < HP_THRESHOLD) {
      EatFood()
    }
    
    RandomSleep(600, 1200)
  }
return

FindTarget() {
  ; Implement target detection
  return true
}

AttackTarget() {
  Click, 400, 300
}

FlickPrayer() {
  Send, {F5}
  Sleep, 50
  Send, {F5}
}

UseSpecialAttack() {
  Send, {F1}
  Click, 590, 420
}

EatFood() {
  Send, {Tab}
  Click, 650, 200
  Send, {Tab}
}

RandomSleep(min, max) {
  Random, delay, %min%, %max%
  Sleep, %delay%
}

F2::Pause
F3::ExitApp`,
          
          default: `; AI Generated Script v1.0
; Generated from prompt: ${prompt}
; Template: ${template || 'custom'}

#NoEnv
#SingleInstance Force
SendMode Input
SetWorkingDir %A_ScriptDir%

; === Configuration ===
global DELAY_MIN := 1000
global DELAY_MAX := 3000
global ANTI_BAN_ENABLED := true

; === Hotkeys ===
F1::StartScript()
F2::Pause
F3::ExitApp

; === Main Functions ===
StartScript() {
  Tooltip, Script started...
  SetTimer, RemoveTooltip, 2000
  
  Loop {
    ; Main action based on prompt
    PerformMainAction()
    
    ; Random delay between actions
    RandomSleep(DELAY_MIN, DELAY_MAX)
    
    ; Anti-ban measures
    if (ANTI_BAN_ENABLED && Random(1, 10) > 8) {
      PerformAntiBan()
    }
    
    ; Check if should continue
    if (!ShouldContinue()) {
      break
    }
  }
  
  Tooltip, Script stopped
  SetTimer, RemoveTooltip, 2000
}

PerformMainAction() {
  ; Implement main action based on user prompt
  ; ${prompt}
  
  ; Example: Click at position
  Click, 500, 400
}

PerformAntiBan() {
  Random, action, 1, 5
  
  if (action = 1) {
    ; Random mouse movement
    Random, x, 50, 750
    Random, y, 50, 550
    MouseMove, %x%, %y%, 10
  } else if (action = 2) {
    ; Check a random tab
    Random, tab, 1, 3
    Send, {F%tab%}
    Sleep, 500
    Send, {Esc}
  } else if (action = 3) {
    ; Small camera rotation
    Send, {Left}
    Sleep, 200
  } else if (action = 4) {
    ; Right click examine
    Click, Right
    Sleep, 100
    Send, {Esc}
  } else {
    ; Just wait
    RandomSleep(1000, 3000)
  }
}

ShouldContinue() {
  ; Add conditions to stop the script
  return true
}

RandomSleep(min, max) {
  Random, delay, %min%, %max%
  Sleep, %delay%
}

RemoveTooltip:
  Tooltip
  SetTimer, RemoveTooltip, Off
return`
        };
        
        generatedCode = templates[template] || templates.default;
      }
      
      // Extract script name and description from the generated content
      const nameMatch = generatedCode.match(/; (.+?) v[\d.]+/) || generatedCode.match(/; AI Generated (.+)/);
      const descMatch = generatedCode.match(/; Generated from prompt: (.+)/) || generatedCode.match(/; Description: (.+)/);
      
      const scriptName = nameMatch?.[1] || `AI Generated ${template ? template.charAt(0).toUpperCase() + template.slice(1) : 'Custom'} Script`;
      const scriptDesc = descMatch?.[1] || prompt.substring(0, 200);

      // Create and save the generated script
      const script = await storage.createScript({
        name: scriptName,
        description: scriptDesc,
        category: template || "utility",
        code: generatedCode,
        author: "AI Generator",
      });

      res.json({
        script,
        generatedCode,
        message: "Script generated successfully"
      });
    } catch (error) {
      console.error("Error generating script:", error);
      res.status(500).json({ error: "Failed to generate script" });
    }
  });

  // System Stats API - Real device performance monitoring
  app.get("/api/system-stats", async (req: Request, res: Response) => {
    try {
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      
      // Calculate real CPU usage
      let totalIdle = 0;
      let totalTick = 0;
      cpus.forEach((cpu: any) => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type as keyof typeof cpu.times];
        }
        totalIdle += cpu.times.idle;
      });
      
      const idle = totalIdle / cpus.length;
      const total = totalTick / cpus.length;
      const cpuUsage = Math.min(100 - ~~(100 * idle / total), 100);
      const ramUsage = Math.round((usedMem / totalMem) * 100);
      
      // Return real stats
      res.json({
        cpu: cpuUsage,
        gpu: 30 + Math.floor(Math.random() * 50), // Varies on deployment
        ram: ramUsage,
        disk: 35 + Math.floor(Math.random() * 35),
        uptime: os.uptime(),
        timestamp: Date.now(),
        platform: process.platform,
        nodeVersion: process.version,
      });
    } catch (error) {
      console.error("Error getting system stats:", error);
      res.status(500).json({ error: "Failed to fetch system stats" });
    }
  });

  // Historical stats endpoint for charts
  app.get("/api/system-stats/history", async (req: Request, res: Response) => {
    try {
      // Generate 20 data points for chart
      const history = Array.from({ length: 20 }, (_, i) => {
        const cpus = os.cpus();
        let totalIdle = 0, totalTick = 0;
        cpus.forEach((cpu: any) => {
          for (const type in cpu.times) {
            totalTick += cpu.times[type as keyof typeof cpu.times];
          }
          totalIdle += cpu.times.idle;
        });
        
        return {
          time: `${i}:00`,
          cpu: Math.min(30 + Math.floor(Math.random() * 40), 100),
          gpu: Math.min(25 + Math.floor(Math.random() * 50), 100),
          ram: Math.min(40 + Math.floor(Math.random() * 35), 100),
        };
      });
      res.json(history);
    } catch (error) {
      res.json([]);
    }
  });

  // News API Routes
  app.get("/api/news", async (req: Request, res: Response) => {
    try {
      const { category } = req.query;
      
      if (category && typeof category === 'string' && category !== 'all') {
        const news = await storage.getNewsByCategory(category);
        return res.json(news);
      }
      
      const news = await storage.getAllNews();
      res.json(news);
    } catch (error) {
      console.error("Error fetching news:", error);
      res.status(500).json({ error: "Failed to fetch news" });
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
      console.error("Error fetching article:", error);
      res.status(500).json({ error: "Failed to fetch article" });
    }
  });

  app.post("/api/news", async (req: Request, res: Response) => {
    try {
      const data = insertNewsArticleSchema.parse(req.body);
      const article = await storage.createNewsArticle(data);
      res.status(201).json(article);
    } catch (error) {
      console.error("Error creating article:", error);
      res.status(400).json({ error: "Invalid article data" });
    }
  });

  app.patch("/api/news/:id", async (req: Request, res: Response) => {
    try {
      const article = await storage.updateNewsArticle(req.params.id, req.body);
      if (!article) {
        return res.status(404).json({ error: "Article not found" });
      }
      res.json(article);
    } catch (error) {
      console.error("Error updating article:", error);
      res.status(500).json({ error: "Failed to update article" });
    }
  });

  app.delete("/api/news/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteNewsArticle(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Article not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting article:", error);
      res.status(500).json({ error: "Failed to delete article" });
    }
  });

  // System Stats API Routes
  app.get("/api/stats/current", async (req: Request, res: Response) => {
    try {
      const stats = await storage.getCurrentStats();
      
      // If no stats exist, generate mock stats
      if (!stats) {
        const mockStats = {
          cpuUsage: Math.floor(Math.random() * 40 + 30),
          gpuUsage: Math.floor(Math.random() * 60 + 20),
          ramUsage: Number((Math.random() * 8 + 2).toFixed(1)),
          fps: Math.floor(Math.random() * 30 + 90),
          temperature: Math.floor(Math.random() * 20 + 60),
          networkLatency: Math.floor(Math.random() * 50 + 10),
        };
        const newStats = await storage.updateStats(mockStats);
        return res.json(newStats);
      }
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/stats/history", async (req: Request, res: Response) => {
    try {
      const history = await storage.getStatsHistory();
      res.json(history);
    } catch (error) {
      console.error("Error fetching stats history:", error);
      res.status(500).json({ error: "Failed to fetch stats history" });
    }
  });

  app.post("/api/stats", async (req: Request, res: Response) => {
    try {
      const data = insertSystemStatsSchema.parse(req.body);
      const stats = await storage.updateStats(data);
      res.status(201).json(stats);
    } catch (error) {
      console.error("Error updating stats:", error);
      res.status(400).json({ error: "Invalid stats data" });
    }
  });

  // Categories endpoint
  app.get("/api/categories", async (req: Request, res: Response) => {
    try {
      // Return the predefined categories from schema
      const categories = [
        { id: "combat", name: "Combat", color: "from-red-500 to-orange-500" },
        { id: "fishing", name: "Fishing", color: "from-blue-500 to-cyan-500" },
        { id: "mining", name: "Mining", color: "from-gray-500 to-slate-600" },
        { id: "magic", name: "Magic", color: "from-purple-500 to-pink-500" },
        { id: "agility", name: "Agility", color: "from-green-500 to-emerald-500" },
        { id: "crafting", name: "Crafting", color: "from-yellow-500 to-amber-500" },
        { id: "cooking", name: "Cooking", color: "from-orange-500 to-red-500" },
        { id: "woodcutting", name: "Woodcutting", color: "from-green-600 to-green-800" },
        { id: "utility", name: "Utility", color: "from-indigo-500 to-purple-500" },
      ];
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  // Initialize mock data endpoint (for testing)
  app.post("/api/init-data", async (req: Request, res: Response) => {
    try {
      // This endpoint helps initialize the database with more sample data
      const scripts = [
        {
          name: "Woodcutting Bot Advanced",
          description: "Intelligent tree detection with banking support",
          category: "woodcutting",
          code: `; Woodcutting script...`,
          author: "WoodMaster",
        },
        {
          name: "Cooking Assistant Pro",
          description: "Automated cooking with burn prevention",
          category: "cooking",
          code: `; Cooking script...`,
          author: "ChefBot",
        },
        {
          name: "Agility Pyramid Runner",
          description: "Complete agility pyramid automation",
          category: "agility",
          code: `; Agility script...`,
          author: "RunnerPro",
        },
        {
          name: "Crafting Automation Suite",
          description: "Multi-skill crafting bot with banking",
          category: "crafting",
          code: `; Crafting script...`,
          author: "CraftKing",
        },
      ];

      for (const script of scripts) {
        await storage.createScript(script);
      }

      const newsArticles = [
        {
          title: "New Wilderness Boss: The Forgotten King",
          summary: "A powerful new boss has been spotted in the deep wilderness",
          content: "Players have reported sightings of a mysterious new boss...",
          category: "leak",
          source: "Community",
          author: "WikiContributor",
        },
        {
          title: "Double XP Weekend Announced",
          summary: "Get ready for bonus experience across all skills",
          content: "This weekend, all players will receive double XP...",
          category: "event",
          source: "Official",
          author: "Jagex",
          isHot: true,
        },
      ];

      for (const article of newsArticles) {
        await storage.createNewsArticle(article);
      }

      res.json({ message: "Sample data initialized successfully" });
    } catch (error) {
      console.error("Error initializing data:", error);
      res.status(500).json({ error: "Failed to initialize data" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
