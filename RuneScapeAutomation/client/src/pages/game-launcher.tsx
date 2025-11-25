import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  Play,
  Square,
  Settings,
  Gamepad2,
  Globe,
  Users,
  Trophy,
  Clock,
  Zap,
  Plus,
  Trash2,
  CheckCircle,
  RefreshCw,
  Star,
  Monitor,
  Loader2,
} from "lucide-react";
import heroImage from "@assets/generated_images/OSRS_Grand_Exchange_hero_banner_a82c4135.png";

const gameWorlds = [
  { world: 302, type: "Trade", players: 1852, location: "United Kingdom", ping: 12, members: true },
  { world: 330, type: "House Party", players: 1234, location: "United States", ping: 45, members: true },
  { world: 301, type: "Free", players: 987, location: "United Kingdom", ping: 14, members: false },
  { world: 416, type: "LMS", players: 567, location: "Australia", ping: 120, members: true },
  { world: 373, type: "2200 Total", players: 432, location: "Germany", ping: 28, members: true },
];

const clientIcons: Record<string, any> = {
  browser: Globe,
  launcher: Monitor,
  steam: Trophy,
  runelite: Zap,
};

export default function GameLauncher() {
  const { toast } = useToast();
  const [selectedWorld, setSelectedWorld] = useState(302);
  const [isLaunching, setIsLaunching] = useState(false);
  const [gameStatus, setGameStatus] = useState<"offline" | "launching" | "running">("offline");
  const [selectedClient, setSelectedClient] = useState("runelite");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountClient, setNewAccountClient] = useState("runelite");

  // Fetch accounts
  const { data: accounts = [], isLoading: accountsLoading, refetch: refetchAccounts } = useQuery({
    queryKey: ['/api/game/accounts'],
    queryFn: async () => {
      try {
        const res = await fetch("/api/game/accounts");
        if (!res.ok) throw new Error("Failed to fetch accounts");
        return res.json();
      } catch (e) {
        console.log("Could not fetch accounts (offline mode)");
        return [];
      }
    },
  });

  // Detect clients
  const { data: detectedClients = [], refetch: refetchClients } = useQuery({
    queryKey: ['/api/game/clients/detect'],
    queryFn: async () => {
      try {
        const res = await fetch("/api/game/clients/detect");
        if (!res.ok) throw new Error("Failed to detect clients");
        return res.json();
      } catch (e) {
        console.log("Could not detect clients");
        return [];
      }
    },
  });

  // Add account mutation
  const addAccountMutation = useMutation({
    mutationFn: async (data: { name: string; client: string }) => {
      const res = await fetch("/api/game/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add account");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/accounts'] });
      setNewAccountName("");
      toast({
        title: "Account added",
        description: `New ${newAccountClient} account created successfully`,
      });
    },
  });

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await fetch(`/api/game/accounts/${accountId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete account");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/accounts'] });
      toast({ title: "Account deleted", description: "Account removed successfully" });
    },
  });

  // Launch game mutation
  const launchMutation = useMutation({
    mutationFn: async (data: { accountId?: string; client: string }) => {
      const res = await fetch("/api/game/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to launch game");
      return res.json();
    },
    onSuccess: (data) => {
      setGameStatus("running");
      toast({
        title: "Game launched",
        description: data.message,
      });
      setTimeout(() => {
        setIsLaunching(false);
      }, 2000);
    },
    onError: () => {
      setIsLaunching(false);
      toast({
        title: "Launch failed",
        description: "Could not launch game. Check your settings.",
        variant: "destructive",
      });
    },
  });

  const handleLaunch = (accountId?: string) => {
    setIsLaunching(true);
    setGameStatus("launching");
    launchMutation.mutate({ accountId, client: selectedClient });
  };

  const handleAddAccount = () => {
    if (!newAccountName.trim()) {
      toast({ title: "Error", description: "Please enter an account name", variant: "destructive" });
      return;
    }
    addAccountMutation.mutate({ name: newAccountName, client: newAccountClient });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative h-[400px] overflow-hidden">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-transparent to-secondary/20" />
        
        <div className="relative z-10 h-full flex flex-col justify-center items-center text-center p-8">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-black/50 backdrop-blur-md border border-primary/30">
              {gameStatus === "running" ? (
                <>
                  <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-green-500 font-semibold">Game Running</span>
                </>
              ) : gameStatus === "launching" ? (
                <>
                  <span className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
                  <span className="text-yellow-500 font-semibold">Launching...</span>
                </>
              ) : (
                <>
                  <span className="w-3 h-3 bg-gray-500 rounded-full" />
                  <span className="text-gray-400 font-semibold">Game Offline</span>
                </>
              )}
            </div>
            
            <h1 className="text-6xl font-gaming font-bold text-white drop-shadow-2xl">
              OLD SCHOOL RUNESCAPE
            </h1>
            <p className="text-xl text-white/90 max-w-2xl">
              Adventure awaits in the world of Gielinor. Choose your account and launch your game.
            </p>
            
            <div className="flex gap-4 justify-center">
              <Button 
                size="lg"
                className="px-12 py-6 text-lg bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold"
                onClick={() => handleLaunch()}
                disabled={isLaunching || gameStatus === "running" || accountsLoading}
                data-testid="button-launch-osrs"
              >
                {isLaunching ? (
                  <>
                    <RefreshCw className="w-6 h-6 mr-2 animate-spin" />
                    Launching...
                  </>
                ) : gameStatus === "running" ? (
                  <>
                    <CheckCircle className="w-6 h-6 mr-2" />
                    Game Running
                  </>
                ) : (
                  <>
                    <Play className="w-6 h-6 mr-2" />
                    Launch Game
                  </>
                )}
              </Button>
              {gameStatus === "running" && (
                <Button 
                  size="lg"
                  variant="destructive"
                  className="px-8 py-6 text-lg"
                  onClick={() => setGameStatus("offline")}
                >
                  <Square className="w-6 h-6 mr-2" />
                  Stop Game
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Game Accounts */}
        <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Game Accounts
            </CardTitle>
            <CardDescription>
              Add your OSRS accounts for quick launch with auto-login
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Add New Account */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-3">
              <h4 className="font-semibold text-sm">Add New Account</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="account-name" className="text-xs mb-1 block">Account Name</Label>
                  <Input
                    id="account-name"
                    placeholder="My Main, Alt 1, etc"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div>
                  <Label htmlFor="client-type" className="text-xs mb-1 block">Client Type</Label>
                  <Select value={newAccountClient} onValueChange={setNewAccountClient}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="browser">Browser</SelectItem>
                      <SelectItem value="runelite">RuneLite</SelectItem>
                      <SelectItem value="launcher">Official Launcher</SelectItem>
                      <SelectItem value="steam">Steam</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button 
                    size="sm" 
                    className="w-full"
                    onClick={handleAddAccount}
                    disabled={addAccountMutation.isPending}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Account
                  </Button>
                </div>
              </div>
            </div>

            {/* Existing Accounts */}
            {accountsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No accounts added yet. Create one above to get started!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {accounts.map((account: any) => {
                  const ClientIcon = clientIcons[account.client] || Gamepad2;
                  return (
                    <Card 
                      key={account.id}
                      className="border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-primary/20">
                              <ClientIcon className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-sm">{account.name}</h4>
                              <p className="text-xs text-muted-foreground capitalize">{account.client}</p>
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => deleteAccountMutation.mutate(account.id)}
                            disabled={deleteAccountMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                        <Button 
                          size="sm" 
                          className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:opacity-90"
                          onClick={() => handleLaunch(account.id)}
                          disabled={isLaunching}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Launch with {account.name}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client Settings & Detection */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Preferred Client */}
          <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-secondary" />
                Preferred Client
              </CardTitle>
              <CardDescription>
                Choose your default OSRS client for launching
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="browser">
                    <span className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Web Browser
                    </span>
                  </SelectItem>
                  <SelectItem value="runelite">
                    <span className="flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      RuneLite
                    </span>
                  </SelectItem>
                  <SelectItem value="launcher">
                    <span className="flex items-center gap-2">
                      <Monitor className="w-4 h-4" />
                      Official Launcher
                    </span>
                  </SelectItem>
                  <SelectItem value="steam">
                    <span className="flex items-center gap-2">
                      <Trophy className="w-4 h-4" />
                      Steam
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" className="w-full" onClick={() => refetchClients()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Detect Installed Clients
              </Button>
            </CardContent>
          </Card>

          {/* Detected Clients */}
          <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-accent" />
                Detected Clients
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {detectedClients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Detecting clients...</p>
                ) : (
                  detectedClients.map((client: any) => (
                    <div key={client.type} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const Icon = clientIcons[client.type];
                          return <Icon className="w-4 h-4 text-primary" />;
                        })()}
                        <span className="text-sm capitalize">{client.type}</span>
                      </div>
                      {client.detected ? (
                        <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Found
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Not Found
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* World Selector */}
        <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              World Selector
            </CardTitle>
            <CardDescription>
              Choose your preferred game world based on location and activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {gameWorlds.map((world) => (
                <div
                  key={world.world}
                  className={`
                    flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all
                    ${selectedWorld === world.world 
                      ? 'bg-primary/20 border border-primary/30' 
                      : 'bg-muted/30 hover:bg-muted/50'}
                  `}
                  onClick={() => setSelectedWorld(world.world)}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="font-gaming text-lg font-bold">W{world.world}</p>
                      <Badge variant="outline" className="text-xs">
                        {world.type}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-sm">
                      <span>{world.location}</span>
                      <div className="text-xs text-muted-foreground">
                        {world.players} players • {world.ping}ms ping
                      </div>
                    </div>
                  </div>
                  {selectedWorld === world.world && (
                    <CheckCircle className="w-5 h-5 text-primary" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
